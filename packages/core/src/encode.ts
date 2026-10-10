import type {
  DateValue,
  FieldValue,
  FormSchema,
  FormValues,
  OtherValue,
  Question,
  TimeValue,
  ValidationIssue,
  ValidationResult,
} from "@ez-gform/types";

const OTHER_SENTINEL = "__other_option__";

const isOtherValue = (v: unknown): v is OtherValue => {
  return (
    typeof v === "object" && v !== null && !Array.isArray(v) && "other" in v
  );
};

const isDateValue = (v: unknown): v is DateValue => {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "day" in v &&
    "month" in v
  );
};

const isTimeValue = (v: unknown): v is TimeValue => {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "hour" in v &&
    "minute" in v &&
    !("day" in v)
  );
};

const pad2 = (n: number): string => {
  return String(n).padStart(2, "0");
};

const appendScalar = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined | null,
): void => {
  if (value === undefined || value === null) return;
  const str = String(value);
  if (str.length === 0) return;
  params.append(key, str);
};

const appendChoiceItem = (
  params: URLSearchParams,
  entryId: string,
  item: string | OtherValue,
): void => {
  if (isOtherValue(item)) {
    // An Other with empty text is not an answer; whitespace-only is sent
    // verbatim, matching appendScalar.
    if (item.other === "") return;
    params.append(entryId, OTHER_SENTINEL);
    appendScalar(params, `${entryId}.other_option_response`, item.other);
  } else {
    appendScalar(params, entryId, item);
  }
};

const appendGridMap = (
  params: URLSearchParams,
  gridMap: Record<string, string | string[]>,
): void => {
  for (const [rowEntryId, colValue] of Object.entries(gridMap)) {
    if (Array.isArray(colValue)) {
      for (const v of colValue) appendScalar(params, rowEntryId, v);
    } else {
      appendScalar(params, rowEntryId, colValue);
    }
  }
};

/**
 * Encodes `FormValues` into `entry.NNN`-keyed `URLSearchParams`, per every
 * rule in `docs/research/google-forms-internals.md` §3. Pure: never throws
 * on invalid/unknown data, and never validates against a schema — pair with
 * `validateValues` for that. The second parameter is accepted (and ignored)
 * for call-site compatibility with `validateValues(values, schema)`.
 */
export const encodeValues = (
  values: FormValues,
  _?: FormSchema,
): URLSearchParams => {
  const params = new URLSearchParams();

  for (const [entryId, rawValue] of Object.entries(values)) {
    encodeOne(params, entryId, rawValue);
  }

  return params;
};

const encodeOne = (
  params: URLSearchParams,
  entryId: string,
  value: FieldValue,
): void => {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) appendChoiceItem(params, entryId, item);
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    appendScalar(params, entryId, value);
    return;
  }

  if (isOtherValue(value)) {
    appendChoiceItem(params, entryId, value);
    return;
  }

  if (isDateValue(value)) {
    if (value.year !== undefined)
      appendScalar(params, `${entryId}_year`, value.year);
    appendScalar(params, `${entryId}_month`, value.month);
    appendScalar(params, `${entryId}_day`, value.day);
    if (value.hour !== undefined)
      appendScalar(params, `${entryId}_hour`, pad2(value.hour));
    if (value.minute !== undefined)
      appendScalar(params, `${entryId}_minute`, pad2(value.minute));
    return;
  }

  if (isTimeValue(value)) {
    if (value.hour !== undefined)
      appendScalar(params, `${entryId}_hour`, pad2(value.hour));
    if (value.minute !== undefined)
      appendScalar(params, `${entryId}_minute`, pad2(value.minute));
    if (value.second !== undefined)
      appendScalar(params, `${entryId}_second`, pad2(value.second));
    return;
  }

  // Otherwise: grid row map, Record<string, string | string[]>.
  appendGridMap(params, value);
};

const hasNumbers = (v: object, keys: string[]): boolean => {
  const record = v as Record<string, unknown>;
  return keys.every((k) => {
    return typeof record[k] === "number";
  });
};

/**
 * A date or time answer counts as empty unless every part the question
 * collects is present: month and day, plus year when `includeYear` and hour
 * and minute when `includeTime`; a time needs hour and minute.
 */
const isIncompleteDateTime = (q: Question, v: object): boolean => {
  if (q.type === "time") return !hasNumbers(v, ["hour", "minute"]);
  const keys = ["month", "day"];
  if (q.date?.includeYear) keys.push("year");
  if (q.date?.includeTime) keys.push("hour", "minute");
  return !hasNumbers(v, keys);
};

/**
 * Validates `values` against a parsed `FormSchema`: unknown entry ids and
 * missing required questions. A required grid row is satisfied by either a flat
 * `values[rowEntryId]` or a nested `values[question.entryId][rowEntryId]` map
 * (both shapes `encodeValues` accepts). An Other value with empty text
 * (`{ other: "" }`) does not count as an answer. `file_upload` questions are
 * skipped: uploads need a Google sign-in, which anonymous submission cannot
 * provide, so a required upload could never be satisfied.
 */
export const validateValues = (
  values: FormValues,
  schema: FormSchema,
): ValidationResult => {
  const errors: ValidationIssue[] = [];

  const knownEntryIds = new Set<string>();
  for (const q of schema.questions) {
    knownEntryIds.add(q.entryId);
    for (const row of q.rows ?? []) knownEntryIds.add(row.entryId);
  }

  for (const key of Object.keys(values)) {
    if (!knownEntryIds.has(key)) {
      errors.push({
        entryId: key,
        message: `Unknown entry id "${key}" is not present in the form schema`,
      });
    }
  }

  for (const q of schema.questions) {
    if (!q.required || q.type === "file_upload") continue;
    const nested = values[q.entryId];
    const nestedMap =
      typeof nested === "object" &&
      nested !== null &&
      !Array.isArray(nested) &&
      !isOtherValue(nested) &&
      !isDateValue(nested) &&
      !isTimeValue(nested)
        ? (nested as Record<string, unknown>)
        : undefined;
    const idsToCheck =
      q.rows && q.rows.length > 0
        ? q.rows.map((r) => {
            return r.entryId;
          })
        : [q.entryId];
    for (const id of idsToCheck) {
      const v: unknown =
        values[id] ?? (q.rows?.length ? nestedMap?.[id] : undefined);
      const isEmpty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) &&
          v.every((i) => {
            return isOtherValue(i) && i.other === "";
          })) ||
        (isOtherValue(v) && v.other === "") ||
        (typeof v === "object" &&
          !Array.isArray(v) &&
          ((q.type === "date" || q.type === "time") && !q.rows?.length
            ? isIncompleteDateTime(q, v)
            : Object.keys(v).length === 0));
      if (isEmpty) {
        errors.push({
          entryId: id,
          message: `Missing required answer for question "${q.title}" (${id})`,
        });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};
