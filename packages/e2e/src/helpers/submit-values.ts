import type { FormSchema, FormValues, Question } from "@ez-gform/types";

export interface Variant {
  values: FormValues;
  /** Exact cell text expected in the response sheet, keyed by column header. */
  expected: Record<string, string>;
}

const byTitle = (schema: FormSchema, title: string): Question => {
  const q = schema.questions.find((item) => {
    return item.title === title;
  });
  if (!q) throw new Error(`Live form has no question titled "${title}"`);
  return q;
};

const option = (q: Question, index: number): string => {
  const opt = (q.options ?? []).filter((o) => {
    return !o.isOther;
  })[index];
  if (!opt) throw new Error(`"${q.title}" has no option #${index}`);
  return opt.value;
};

const row = (q: Question, index: number) => {
  const r = q.rows?.[index];
  if (!r) throw new Error(`"${q.title}" has no row #${index}`);
  return r;
};

/** Builds a full set of answers (every question) plus the sheet cells they must produce. */
export const buildVariant = (
  schema: FormSchema,
  marker: string,
  which: "a" | "b",
): Variant => {
  const a = which === "a";
  const q = (title: string): Question => {
    return byTitle(schema, title);
  };
  const values: FormValues = {};
  const expected: Record<string, string> = {};
  const set = (
    title: string,
    value: FormValues[string],
    cell: string,
    header = title,
  ): void => {
    values[q(title).entryId] = value;
    expected[header] = cell;
  };

  set("Short answer required", marker, marker);
  set("Short answer optional", a ? "42" : "7.5", a ? "42" : "7.5");
  const paragraph = a
    ? 'Line one, with comma\nLine two "quoted"'
    : 'Second run, comma\nsecond "line"';
  set("Paragraph question", paragraph, paragraph);

  const plain = q("Radio plain");
  set("Radio plain", option(plain, a ? 0 : 2), option(plain, a ? 0 : 2));
  const radioOther = a ? "Teal, custom" : "Navy";
  set("Radio with other", { other: radioOther }, radioOther);
  const dropdown = q("Dropdown question");
  set(
    "Dropdown question",
    option(dropdown, a ? 1 : 2),
    option(dropdown, a ? 1 : 2),
  );

  const cb = q("Checkboxes plain");
  const cbPick = a ? [0, 2] : [1, 2];
  set(
    "Checkboxes plain",
    cbPick.map((i) => {
      return option(cb, i);
    }),
    cbPick
      .map((i) => {
        return option(cb, i);
      })
      .join(", "),
  );
  const cbo = q("Checkboxes with other");
  const cboOther = a ? "Hamster" : "Parrot, green";
  set(
    "Checkboxes with other",
    [option(cbo, 0), { other: cboOther }],
    `${option(cbo, 0)}, ${cboOther}`,
  );
  const cbv = q("Checkboxes with validation");
  const cbvPick = a ? [0, 2] : [1, 2, 3];
  set(
    "Checkboxes with validation",
    cbvPick.map((i) => {
      return option(cbv, i);
    }),
    cbvPick
      .map((i) => {
        return option(cbv, i);
      })
      .join(", "),
  );

  set("Scale with labels", a ? 4 : 2, a ? "4" : "2");
  set("Scale without labels", a ? 7 : 0, a ? "7" : "0");

  const rg = q("Radio grid");
  const rgCols = a ? [1, 2] : [2, 0];
  rgCols.forEach((col, i) => {
    const r = row(rg, i);
    const cell = option(rg, col);
    values[r.entryId] = cell;
    expected[`Radio grid [${r.label}]`] = cell;
  });
  const cg = q("Checkbox grid");
  const cgCols = a ? [[0, 1], [1]] : [[0], [0, 1]];
  cgCols.forEach((cols, i) => {
    const r = row(cg, i);
    const picked = cols.map((c) => {
      return option(cg, c);
    });
    values[r.entryId] = picked;
    expected[`Checkbox grid [${r.label}]`] = picked.join(", ");
  });

  set("Rating question", a ? 3 : 5, a ? "3" : "5");

  // Date/time cell formats are pinned from observation of the live sheet.
  set(
    "Date with year",
    a ? { year: 2026, month: 3, day: 14 } : { year: 2024, month: 2, day: 29 },
    a ? "3/14/2026" : "2/29/2024",
  );
  set(
    "Date with year and time",
    a
      ? { year: 2025, month: 12, day: 31, hour: 23, minute: 5 }
      : { year: 2023, month: 1, day: 2, hour: 0, minute: 0 },
    a ? "12/31/2025 23:05:00" : "1/2/2023 0:00:00",
  );
  set(
    "Date without year",
    a ? { month: 2, day: 29 } : { month: 11, day: 5 },
    a ? "2/29" : "11/5",
  );
  set(
    "Date with time without year",
    a
      ? { month: 7, day: 4, hour: 9, minute: 30 }
      : { month: 10, day: 31, hour: 18, minute: 45 },
    a ? "7/4 9:30" : "10/31 18:45",
  );
  set(
    "Time of day",
    a ? { hour: 14, minute: 45 } : { hour: 6, minute: 5 },
    a ? "2:45:00 PM" : "6:05:00 AM",
  );
  set(
    "Duration",
    a
      ? { hour: 1, minute: 23, second: 45 }
      : { hour: 12, minute: 0, second: 5 },
    a ? "1:23:45" : "12:00:05",
  );

  return { values, expected };
};
