import type { FormSchema, Question, QuestionType } from "@ez-gform/types";
import { describe, expect, it } from "vitest";
import { typeCheck } from "../__test-utils__/compile-check.js";
import {
  FIXTURE_SLUGS,
  loadFixtureSchema,
} from "../__test-utils__/fixtures.js";
import { generateTypes } from "../generate-types.js";

const question = (
  type: QuestionType,
  overrides: Partial<Question> = {},
): Question => {
  return {
    id: "1",
    entryId: "entry.1",
    title: "Q",
    type,
    required: true,
    ...overrides,
  };
};

const schemaOf = (
  questions: Question[],
  overrides: Partial<FormSchema> = {},
): FormSchema => {
  return {
    formId: "f",
    title: "My Form",
    questions,
    sections: [],
    multiPage: false,
    ...overrides,
  };
};

const valuesBlock = (source: string): string => {
  const start = source.indexOf("Values = {\n");
  return source.slice(start);
};

describe("generateTypes", () => {
  for (const slug of FIXTURE_SLUGS) {
    it(`generates types for ${slug} that type-check`, () => {
      const schema = loadFixtureSchema(slug);
      const source = generateTypes(schema);

      expect(source).toContain("as const satisfies FormSchema");
      expect(source).toContain("Values = {");

      const result = typeCheck(source, { fileName: "/virtual/generated.ts" });
      expect(result.diagnostics.join("\n")).toBe("");
      expect(result.ok).toBe(true);
    });
  }

  it("marks required questions as non-optional and others as optional", () => {
    const schema = loadFixtureSchema("all-question-types");
    const source = generateTypes(schema);
    for (const question of schema.questions) {
      if (question.type === "file_upload") continue;
      const key = JSON.stringify(question.entryId);
      const optionalPattern = new RegExp(
        `${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?:`,
      );
      const requiredPattern = new RegExp(
        `${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`,
      );
      if (question.required) {
        expect(source).toMatch(requiredPattern);
        expect(optionalPattern.test(source)).toBe(false);
      } else {
        expect(source).toMatch(optionalPattern);
      }
    }
  });

  it("uses a checkboxes-with-other type when the question has an Other option", () => {
    const schema = loadFixtureSchema("all-question-types");
    const checkboxWithOther = schema.questions.find((q) => {
      return (
        q.type === "checkboxes" &&
        q.options?.some((o) => {
          return o.isOther;
        })
      );
    });
    expect(checkboxWithOther).toBeDefined();
    if (!checkboxWithOther) return;
    const source = generateTypes(schema);
    expect(source).toContain(
      `${JSON.stringify(checkboxWithOther.entryId)}${
        checkboxWithOther.required ? "" : "?"
      }: (string | { other: string })[];`,
    );
  });

  it("uses a provided name", () => {
    const schema = loadFixtureSchema("all-question-types");
    const source = generateTypes(schema, { name: "Custom" });
    expect(source).toContain("export const CustomSchema =");
    expect(source).toContain("export type CustomValues =");
  });

  it.each<[QuestionType, string]>([
    ["short_answer", "string"],
    ["paragraph", "string"],
    ["multiple_choice", "string"],
    ["dropdown", "string"],
    ["checkboxes", "string[]"],
    ["linear_scale", "number"],
    ["date", "DateValue"],
    ["time", "TimeValue"],
  ])("maps %s to %s", (type, expected) => {
    const source = generateTypes(schemaOf([question(type)]));
    expect(valuesBlock(source)).toBe(
      `Values = {\n  "entry.1": ${expected};\n};\n`,
    );
  });

  it.each<QuestionType>(["multiple_choice", "dropdown"])(
    "allows an { other } object for %s with an Other option",
    (type) => {
      const source = generateTypes(
        schemaOf([
          question(type, {
            options: [
              { value: "A", isOther: false },
              { value: "", isOther: true },
            ],
          }),
        ]),
      );
      expect(source).toContain('"entry.1": string | { other: string };');
    },
  );

  it("keeps plain string for choice questions whose options have no Other", () => {
    const source = generateTypes(
      schemaOf([
        question("dropdown", { options: [{ value: "A", isOther: false }] }),
      ]),
    );
    expect(source).toContain('"entry.1": string;');
  });

  it("emits the plain string[] type for checkboxes without Other", () => {
    const source = generateTypes(
      schemaOf([
        question("checkboxes", { options: [{ value: "A", isOther: false }] }),
      ]),
    );
    expect(source).toContain('"entry.1": string[];');
  });

  it("emits the Other-aware array type for checkboxes with Other", () => {
    const source = generateTypes(
      schemaOf([
        question("checkboxes", {
          options: [{ value: "", isOther: true }],
        }),
      ]),
    );
    expect(source).toContain('"entry.1": (string | { other: string })[];');
  });

  it.each<QuestionType>(["grid", "checkbox_grid"])(
    "builds a row-key union for %s",
    (type) => {
      const source = generateTypes(
        schemaOf([
          question(type, {
            rows: [
              { entryId: "entry.1", label: "R1" },
              { entryId: "entry.2", label: "R2" },
            ],
          }),
        ]),
      );
      expect(source).toContain(
        '"entry.1": Record<"entry.1" | "entry.2", string | string[]>;',
      );
    },
  );

  it("falls back to string keys for a grid with no rows", () => {
    const withEmpty = generateTypes(schemaOf([question("grid", { rows: [] })]));
    const withUndefined = generateTypes(schemaOf([question("checkbox_grid")]));
    const expected = '"entry.1": Record<string, string | string[]>;';
    expect(withEmpty).toContain(expected);
    expect(withUndefined).toContain(expected);
  });

  it("omits file_upload questions from the values type", () => {
    const source = generateTypes(
      schemaOf([
        question("file_upload", { entryId: "entry.9" }),
        question("short_answer"),
      ]),
    );
    expect(valuesBlock(source)).not.toContain("entry.9");
    expect(valuesBlock(source)).toContain('"entry.1": string;');
  });

  it("falls back to string for an unknown question type", () => {
    const source = generateTypes(
      schemaOf([question("mystery" as unknown as QuestionType)]),
    );
    expect(source).toContain('"entry.1": string;');
  });

  it("marks non-required questions optional", () => {
    const source = generateTypes(
      schemaOf([question("short_answer", { required: false })]),
    );
    expect(source).toContain('"entry.1"?: string;');
  });

  it("imports only FormSchema when neither date nor time is used", () => {
    const source = generateTypes(schemaOf([question("short_answer")]));
    expect(
      source.startsWith('import type { FormSchema } from "@ez-gform/core";'),
    ).toBe(true);
  });

  it("imports DateValue only when a date question is present", () => {
    const source = generateTypes(schemaOf([question("date")]));
    expect(
      source.startsWith(
        'import type { DateValue, FormSchema } from "@ez-gform/core";',
      ),
    ).toBe(true);
  });

  it("imports TimeValue only when a time question is present", () => {
    const source = generateTypes(schemaOf([question("time")]));
    expect(
      source.startsWith(
        'import type { FormSchema, TimeValue } from "@ez-gform/core";',
      ),
    ).toBe(true);
  });

  it("imports both DateValue and TimeValue sorted", () => {
    const source = generateTypes(
      schemaOf([
        question("date"),
        question("time", { id: "2", entryId: "entry.2" }),
      ]),
    );
    expect(source.split("\n")[0]).toBe(
      'import type { DateValue, FormSchema, TimeValue } from "@ez-gform/core";',
    );
  });

  it("derives the default name from the form title via toPascalCase", () => {
    const source = generateTypes(schemaOf([], { title: "event rsvp form" }));
    expect(source).toContain("export const EventRsvpFormSchema =");
    expect(source).toContain("export type EventRsvpFormValues = {");
  });

  it("falls back to the Form name for an unusable title", () => {
    const source = generateTypes(schemaOf([], { title: "!!!" }));
    expect(source).toContain("export const FormSchema =");
  });

  it("escapes quotes and backslashes in titles and entry ids", () => {
    const title = 'He said "hi" \\ bye';
    const source = generateTypes(
      schemaOf([question("short_answer", { title, entryId: 'entry."1' })], {
        title,
      }),
    );
    expect(source).toContain(`"title": ${JSON.stringify(title)}`);
    expect(source).toContain('"entry.\\"1": string;');
  });

  it("emits an empty values type for a schema with no questions", () => {
    const source = generateTypes(schemaOf([]));
    expect(valuesBlock(source)).toBe("Values = {\n\n};\n");
  });

  it("does not embed the per-request fbzx token", () => {
    const token = "-1234567890123456789";
    const source = generateTypes(
      schemaOf([question("short_answer")], { fbzx: token }),
    );
    expect(source).not.toContain("fbzx");
    expect(source).not.toContain(token);
  });
});
