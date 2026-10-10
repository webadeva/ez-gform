import type {
  ChoiceOption,
  FormSchema,
  GridRow,
  Question,
  QuestionType,
  Section,
} from "@ez-gform/types";
import { ParseError } from "./errors.js";
import { extractFbzx, extractPublicLoadData } from "./extract.js";

type Json = unknown;

const asArray = (value: Json, context: string): Json[] => {
  if (!Array.isArray(value)) {
    throw new ParseError(
      `parseFormData: expected an array at ${context}, got ${typeof value}`,
    );
  }
  return value;
};

const optionalString = (value: Json): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const toEntryId = (rawId: Json): string => {
  return `entry.${String(rawId)}`;
};

const mapOptions = (rawOptions: Json): ChoiceOption[] | undefined => {
  if (!Array.isArray(rawOptions)) return undefined;
  return rawOptions.map((tuple) => {
    const t = Array.isArray(tuple) ? tuple : [];
    const value = typeof t[0] === "string" ? t[0] : "";
    const isOther = t[4] === 1;
    return { value, isOther };
  });
};

interface SubQuestion {
  entryId: Json;
  options: Json;
  required: Json;
  extra: Json; // [3] - row label / scale labels / null
  rest: Json[]; // full array, for type-specific trailing flags
}

const parseSubQuestions = (rawSubs: Json): SubQuestion[] => {
  const subs = asArray(rawSubs, "question[4]");
  return subs.map((rawSub) => {
    const s = asArray(rawSub, "question[4][i]");
    return {
      entryId: s[0],
      options: s[1],
      required: s[2],
      extra: s[3],
      rest: s,
    };
  });
};

const TYPE_CODE_NAME: Record<
  number,
  QuestionType | "section_header" | "page_break" | "image" | "video"
> = {
  0: "short_answer",
  1: "paragraph",
  2: "multiple_choice",
  3: "dropdown",
  4: "checkboxes",
  5: "linear_scale",
  6: "section_header",
  7: "grid", // resolved to "grid" | "checkbox_grid" below
  8: "page_break",
  9: "date",
  10: "time",
  11: "image",
  12: "video",
  13: "file_upload",
  // ponytail: rating (stars/hearts) has the same wire shape as a linear scale
  // (options "1".."N", submits entry.N=<number>), so it reuses that type. Add a
  // "rating" QuestionType if consumers need to render the icon.
  18: "linear_scale",
};

/**
 * Parses the `FB_PUBLIC_LOAD_DATA_` structure (already `JSON.parse`d, e.g. by
 * `extractPublicLoadData`) into a `FormSchema`, per the verified index map in
 * `docs/research/google-forms-internals.md` §4.
 */
export const parseFormData = (
  data: unknown,
  opts: { formId?: string } = {},
): FormSchema => {
  if (!Array.isArray(data)) {
    throw new ParseError(
      "parseFormData: expected the top-level FB_PUBLIC_LOAD_DATA_ value to be an array",
    );
  }

  const container = data[1];
  if (!Array.isArray(container)) {
    throw new ParseError(
      "parseFormData: expected data[1] (main container) to be an array",
    );
  }

  const description = optionalString(container[0]);
  const rawQuestions = container[1];
  if (!Array.isArray(rawQuestions)) {
    throw new ParseError(
      "parseFormData: expected data[1][1] (question list) to be an array",
    );
  }

  // Title exists in two shapes: data[1][8] (usually a plain string, occasionally
  // the [null, "<title>"] wrapper shape used elsewhere) and data[3] as a plain
  // string (may differ cosmetically, e.g. trailing whitespace or truncation) —
  // prefer data[1][8], falling back to data[3].
  const container8 = container[8];
  const wrappedTitle =
    typeof container8 === "string"
      ? container8
      : Array.isArray(container8)
        ? container8[1]
        : undefined;
  const title =
    typeof wrappedTitle === "string"
      ? wrappedTitle
      : typeof data[3] === "string"
        ? data[3]
        : "";

  let { formId } = opts;
  if (!formId) {
    const rawFormId = data[14];
    if (typeof rawFormId === "string") {
      formId = rawFormId.startsWith("e/") ? rawFormId.slice(2) : rawFormId;
    } else {
      formId = "";
    }
  }

  const questions: Question[] = [];
  const sections: Section[] = [{ title, description, questionIds: [] }];
  let sawPageBreak = false;

  for (const rawEntry of rawQuestions) {
    const entry = asArray(rawEntry, "question entry");
    const id = entry[0];
    const entryTitle = typeof entry[1] === "string" ? entry[1] : "";
    const entryDescription = optionalString(entry[2]);
    const typeCode = entry[3];

    if (typeof typeCode !== "number") {
      throw new ParseError(
        `parseFormData: question ${String(id)} has a non-numeric type code`,
      );
    }

    const kind = TYPE_CODE_NAME[typeCode];
    if (kind === undefined) {
      throw new ParseError(
        `parseFormData: unknown question type code ${typeCode} for question ${String(id)}`,
      );
    }

    if (kind === "image" || kind === "video") {
      continue;
    }

    if (kind === "section_header") {
      const current = sections[sections.length - 1]!;
      current.title = entryTitle;
      current.description = entryDescription;
      continue;
    }

    if (kind === "page_break") {
      sawPageBreak = true;
      sections.push({
        title: entryTitle,
        description: entryDescription,
        questionIds: [],
      });
      continue;
    }

    const subs = parseSubQuestions(entry[4]);
    if (subs.length === 0) {
      throw new ParseError(
        `parseFormData: question ${String(id)} (type ${typeCode}) has no sub-question entries`,
      );
    }
    const firstSub = subs[0]!;

    const question: Question = {
      id: String(id),
      entryId: toEntryId(firstSub.entryId),
      title: entryTitle,
      description: entryDescription,
      type: kind,
      required: firstSub.required === 1,
    };

    switch (kind) {
      case "multiple_choice":
      case "dropdown":
      case "checkboxes": {
        question.options = mapOptions(firstSub.options);
        break;
      }
      case "linear_scale": {
        const options = mapOptions(firstSub.options) ?? [];
        const first = options[0];
        const last = options[options.length - 1];
        if (!first || !last) {
          throw new ParseError(
            `parseFormData: linear scale question ${String(id)} ("${entryTitle}") has no options`,
          );
        }
        const min = Number(first.value);
        const max = Number(last.value);
        const labels = Array.isArray(firstSub.extra) ? firstSub.extra : [];
        question.scale = {
          min,
          max,
          lowLabel: optionalString(labels[0]),
          highLabel: optionalString(labels[1]),
        };
        break;
      }
      case "grid": {
        const rows: GridRow[] = subs.map((sub) => {
          const label = Array.isArray(sub.extra)
            ? optionalString(sub.extra[0])
            : undefined;
          return { entryId: toEntryId(sub.entryId), label: label ?? "" };
        });
        const isCheckboxGrid = subs.some((sub) => {
          const flag = sub.rest[sub.rest.length - 1];
          return Array.isArray(flag) && flag[0] === 1;
        });
        question.type = isCheckboxGrid ? "checkbox_grid" : "grid";
        question.rows = rows;
        question.options = mapOptions(firstSub.options);
        break;
      }
      case "date": {
        const flags = Array.isArray(firstSub.rest[7])
          ? (firstSub.rest[7] as Json[])
          : undefined;
        question.date = {
          includeTime: flags?.[0] === 1,
          includeYear: flags ? flags[1] === 1 : true,
        };
        break;
      }
      case "time": {
        const flags = Array.isArray(firstSub.rest[6])
          ? (firstSub.rest[6] as Json[])
          : undefined;
        question.time = { isDuration: flags?.[0] === 1 };
        break;
      }
      case "file_upload":
        break;
      default:
        break;
    }

    questions.push(question);
    const currentSection = sections[sections.length - 1]!;
    currentSection.questionIds.push(question.id);
  }

  return {
    formId,
    title,
    description,
    questions,
    sections,
    multiPage: sawPageBreak,
  };
};

/** Extracts `FB_PUBLIC_LOAD_DATA_` and `fbzx` from raw `/viewform` HTML, then parses. */
export const parseFormHtml = (html: string): FormSchema => {
  const data = extractPublicLoadData(html);
  const schema = parseFormData(data);
  const fbzx = extractFbzx(html);
  return fbzx ? { ...schema, fbzx } : schema;
};
