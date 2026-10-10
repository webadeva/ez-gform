import type { FormSchema, Question, Section } from "@ez-gform/types";
import { describe, expect, it } from "vitest";
import { transpiles, typeCheck } from "../__test-utils__/compile-check.js";
import {
  FIXTURE_SLUGS,
  loadFixtureSchema,
} from "../__test-utils__/fixtures.js";
import { generateReactComponent } from "../generate-react.js";

describe("generateReactComponent", () => {
  for (const slug of FIXTURE_SLUGS) {
    it(`generates a component for ${slug} that transpiles cleanly`, () => {
      const schema = loadFixtureSchema(slug);
      const source = generateReactComponent(schema);

      expect(source).toContain("useGoogleForm");
      expect(source).toContain("export function");

      const transpileResult = transpiles(source);
      expect(transpileResult.diagnostics.join("\n")).toBe("");
      expect(transpileResult.ok).toBe(true);
    });

    it(`generates a component for ${slug} that type-checks against @ez-gform/react (when built)`, () => {
      const schema = loadFixtureSchema(slug);
      const source = generateReactComponent(schema);
      const result = typeCheck(source, { needsReact: true });
      expect(result.diagnostics.join("\n")).toBe("");
      expect(result.ok).toBe(true);
    }, 120000);
  }

  it("imports everything from @ez-gform/react only (core is a transitive dep)", () => {
    const schema = loadFixtureSchema("all-question-types");
    const source = generateReactComponent(schema);
    expect(source).toContain(
      'import type { FormSchema } from "@ez-gform/react";',
    );
    expect(source).not.toContain("@ez-gform/core");
  });

  it("renders a disabled note for file_upload questions", () => {
    const schema = loadFixtureSchema("file-upload");
    const source = generateReactComponent(schema);
    expect(source).toContain("not supported by Google Forms submission");
  });

  it("respects a provided component name", () => {
    const schema = loadFixtureSchema("all-question-types");
    const source = generateReactComponent(schema, { name: "MyCustomForm" });
    expect(source).toContain("export function MyCustomForm()");
  });

  it("emits plain JSX (no type annotations) when typescript is false", () => {
    const schema = loadFixtureSchema("all-question-types");
    const source = generateReactComponent(schema, { typescript: false });
    expect(source).not.toContain("import type { FormSchema }");
    expect(source).not.toContain("satisfies FormSchema");
    const result = transpiles(source, "generated.jsx");
    expect(result.ok).toBe(true);
  });

  describe("per-question output", () => {
    const question = (overrides: Partial<Question>): Question => {
      return {
        id: "q1",
        entryId: "entry.1",
        title: "Question",
        type: "short_answer",
        required: false,
        ...overrides,
      };
    };

    const schemaOf = (
      questions: Question[],
      overrides: Partial<FormSchema> = {},
    ): FormSchema => {
      return {
        formId: "synthetic",
        title: "Synthetic",
        questions,
        sections: [
          {
            title: "",
            questionIds: questions.map((qn) => {
              return qn.id;
            }),
          },
        ],
        multiPage: false,
        ...overrides,
      };
    };

    const jsxBody = (source: string): string => {
      return source.slice(source.indexOf("return ("));
    };

    it("renders short_answer and paragraph, marking required", () => {
      const source = generateReactComponent(
        schemaOf([
          question({ id: "a", entryId: "entry.1", required: true }),
          question({ id: "b", entryId: "entry.2", type: "paragraph" }),
        ]),
      );
      expect(source).toContain(
        '<input type="text" {...form.register("entry.1")} required />',
      );
      expect(source).toContain('<textarea {...form.register("entry.2")} />');
      expect(source).toContain("<label>Question *</label>");
    });

    it("renders radio options with an Other free-text input", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "multiple_choice",
            options: [
              { value: "A", isOther: false },
              { value: "", isOther: true },
            ],
          }),
        ]),
      );
      expect(source).toContain('<div role="radiogroup">');
      expect(source).toContain(
        'onChange={() => form.setValue("entry.1", "A")}',
      );
      expect(source).toContain(
        'checked={typeof form.values["entry.1"] === "object"}',
      );
      expect(source).toContain(
        'form.setValue("entry.1", { other: e.target.value })',
      );
    });

    it("renders a multiple_choice without options as an empty group", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "multiple_choice" })]),
      );
      expect(source).toContain('<div role="radiogroup">');
      expect(source).not.toContain('type="radio"');
    });

    it("renders a dropdown with a placeholder and required flag", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "dropdown",
            required: true,
            options: [{ value: "One", isOther: false }],
          }),
        ]),
      );
      expect(source).toContain(
        '<select {...form.register("entry.1")} required>',
      );
      expect(source).toContain('<option value="">Select\u2026</option>');
      expect(source).toContain('<option value={"One"}>One</option>');
    });

    it("renders a dropdown without options or required", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "dropdown" })]),
      );
      expect(source).toContain('<select {...form.register("entry.1")}>');
    });

    it("renders checkboxes with registerCheckbox and an Other option", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "checkboxes",
            options: [
              { value: "X", isOther: false },
              { value: "", isOther: true },
            ],
          }),
        ]),
      );
      expect(source).toContain(
        '<input type="checkbox" {...form.registerCheckbox("entry.1", "X")} />',
      );
      expect(source).toContain('[...chosen, { other: "" }]');
    });

    it("renders a checkboxes question without options", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "checkboxes" })]),
      );
      expect(source).not.toContain("registerCheckbox");
    });

    it("renders linear_scale with low and high labels", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "linear_scale",
            scale: { min: 1, max: 3, lowLabel: "Bad", highLabel: "Good" },
          }),
        ]),
      );
      expect(source).toContain("<span>Bad</span>");
      expect(source).toContain("<span>Good</span>");
      expect(source).toContain('=== "3"');
      expect(source).not.toContain('=== "4"');
    });

    it("renders linear_scale defaults (1 to 5) without labels or scale", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "linear_scale" })]),
      );
      expect(source).toContain('=== "5"');
      expect(source).not.toContain("<span>");
    });

    it("renders a radio grid with radios and a checkbox_grid with checkboxes", () => {
      const grid = {
        options: [
          { value: "Col1", isOther: false },
          { value: "Col2", isOther: false },
        ],
        rows: [
          { entryId: "entry.10", label: "Row1" },
          { entryId: "entry.11", label: "Row2" },
        ],
      };
      const radio = generateReactComponent(
        schemaOf([question({ type: "grid", ...grid })]),
      );
      expect(radio).toContain("<th>Row1</th>");
      expect(radio).toContain('<th key={"Col2"}>Col2</th>');
      expect(radio).toContain('name={form.register("entry.11").name}');
      expect(radio).not.toContain("registerCheckbox");

      const checkbox = generateReactComponent(
        schemaOf([question({ type: "checkbox_grid", ...grid })]),
      );
      expect(checkbox).toContain('registerCheckbox("entry.10", "Col1")');
      expect(checkbox).not.toContain('type="radio"');
    });

    it("renders a grid without rows or columns", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "grid" })]),
      );
      expect(source).toContain("<tbody>");
    });

    it("renders date splitting into year, month, day", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "date",
            required: true,
            date: { includeTime: false, includeYear: true },
          }),
        ]),
      );
      expect(source).toContain('type="date"');
      expect(source).toContain("required={true}");
      expect(source).toContain(
        'form.setValue("entry.1", { year, month, day })',
      );
    });

    it("renders date and time inputs as optional by default", () => {
      const source = generateReactComponent(
        schemaOf([
          question({ id: "d", type: "date" }),
          question({ id: "t", entryId: "entry.2", type: "time" }),
        ]),
      );
      expect(source).toContain("required={false}");
      expect(source).toContain('type="time"');
      expect(source).toContain('form.setValue("entry.2", { hour, minute })');
    });

    it("renders time splitting into hour and minute when required", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "time",
            required: true,
            time: { isDuration: false },
          }),
        ]),
      );
      expect(source).toContain("required={true}");
    });

    it("omits the year when includeYear is false", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "date",
            date: { includeTime: false, includeYear: false },
          }),
        ]),
      );
      expect(source).toContain('form.setValue("entry.1", { month, day })');
      expect(source).not.toContain("year");
    });

    it("adds a time input and hour/minute when includeTime is true", () => {
      const source = generateReactComponent(
        schemaOf([
          question({
            type: "date",
            date: { includeTime: true, includeYear: true },
          }),
        ]),
      );
      expect(source).toContain('type="time"');
      expect(source).toContain("hour, minute");
    });

    it("renders a time of day as one time input and a duration as hour/minute/second inputs", () => {
      const duration = generateReactComponent(
        schemaOf([question({ type: "time", time: { isDuration: true } })]),
      );
      const clock = generateReactComponent(
        schemaOf([question({ type: "time", time: { isDuration: false } })]),
      );
      expect(jsxBody(clock)).toContain('type="time"');
      expect(jsxBody(clock)).not.toContain("second");
      expect(jsxBody(duration)).not.toContain('type="time"');
      expect(jsxBody(duration)).toContain('aria-label="Hours"');
      expect(jsxBody(duration)).toContain('aria-label="Minutes"');
      expect(jsxBody(duration)).toContain('aria-label="Seconds"');
      expect(jsxBody(duration)).toContain("second:");
      expect(jsxBody(duration)).not.toContain("hour: 0");
      expect(jsxBody(duration)).not.toContain("?? 0");
      expect(jsxBody(duration)).toContain('=== "" ? undefined : Number(');
      expect(jsxBody(duration)).toContain("allEmpty ? undefined");
      const required = generateReactComponent(
        schemaOf([
          question({
            type: "time",
            required: true,
            time: { isDuration: true },
          }),
        ]),
      );
      expect(jsxBody(required).match(/required=\{true\}/g)).toHaveLength(3);
    });

    it("type-checks a component using every question type together", () => {
      const options = [
        { value: "A", isOther: false },
        { value: "", isOther: true },
      ];
      const source = generateReactComponent(
        schemaOf(
          [
            question({ id: "a", entryId: "entry.1", required: true }),
            question({ id: "b", entryId: "entry.2", type: "paragraph" }),
            question({
              id: "c",
              entryId: "entry.3",
              type: "multiple_choice",
              options,
            }),
            question({
              id: "d",
              entryId: "entry.4",
              type: "dropdown",
              options,
            }),
            question({
              id: "e",
              entryId: "entry.5",
              type: "checkboxes",
              options,
            }),
            question({
              id: "f",
              entryId: "entry.6",
              type: "linear_scale",
              scale: { min: 1, max: 3, lowLabel: "Bad", highLabel: "Good" },
            }),
            question({
              id: "g",
              entryId: "entry.7",
              type: "grid",
              options,
              rows: [{ entryId: "entry.70", label: "R" }],
            }),
            question({
              id: "h",
              entryId: "entry.8",
              type: "checkbox_grid",
              options,
              rows: [{ entryId: "entry.80", label: "R" }],
            }),
            question({ id: "i", entryId: "entry.9", type: "date" }),
            question({ id: "j", entryId: "entry.10", type: "time" }),
          ],
          {
            sections: [
              { title: "One", description: "Desc", questionIds: ["a", "b"] },
              {
                title: "Two",
                questionIds: ["c", "d", "e", "f", "g", "h", "i", "j"],
              },
            ],
            multiPage: true,
          },
        ),
      );
      const result = typeCheck(source, { needsReact: true });
      expect(result.diagnostics.join("\n")).toBe("");
      expect(result.ok).toBe(true);
    }, 120000);

    it("renders a description under the label", () => {
      const source = generateReactComponent(
        schemaOf([question({ description: "Help <text>" })]),
      );
      expect(source).toContain("<p>Help &lt;text&gt;</p>");
    });

    it("falls back to a plain registered input for an unknown type", () => {
      const source = generateReactComponent(
        schemaOf([question({ type: "mystery" as Question["type"] })]),
      );
      expect(source).toContain('<input {...form.register("entry.1")} />');
    });

    it("escapes JSX-significant characters in titles, options and labels", () => {
      const source = generateReactComponent(
        schemaOf(
          [
            question({
              title: 'A & B <c> {d} "e"',
              type: "multiple_choice",
              options: [{ value: "x < y & {z}", isOther: false }],
            }),
            question({
              id: "f",
              entryId: "entry.2",
              title: "File {x}",
              type: "file_upload",
            }),
          ],
          { title: "T & {U}", description: "D <b>" },
        ),
      );
      expect(source).toContain('A &amp; B &lt;c&gt; &#123;d&#125; "e"');
      expect(source).toContain("x &lt; y &amp; &#123;z&#125;");
      expect(source).toContain("<h1>T &amp; &#123;U&#125;</h1>");
      expect(source).toContain("<p>D &lt;b&gt;</p>");
      expect(source).toContain('"File &#123;x&#125;" is a file upload');
      expect(transpiles(source).ok).toBe(true);
    });

    it("renders sections with headings and descriptions when multi-section", () => {
      const questions = [
        question({ id: "a", entryId: "entry.1", title: "First" }),
        question({ id: "b", entryId: "entry.2", title: "Second" }),
      ];
      const sections: Section[] = [
        {
          title: "Part <1>",
          description: "About & part",
          questionIds: ["a", "ghost"],
        },
        { title: "", questionIds: ["b"] },
      ];
      const source = generateReactComponent(
        schemaOf(questions, { sections, multiPage: true }),
      );
      expect(source).toContain("<h2>Part &lt;1&gt;</h2>");
      expect(source).toContain("<p>About &amp; part</p>");
      expect(source).toContain("First");
      expect(source).toContain("Second");
      expect(jsxBody(source)).not.toContain("ghost");
    });

    it("uses the section branch for a single titled section", () => {
      const source = generateReactComponent(
        schemaOf([question({})], {
          sections: [{ title: "Only", questionIds: ["q1"] }],
        }),
      );
      expect(source).toContain("<h2>Only</h2>");
    });

    it("renders flat questions when there is a single untitled section", () => {
      const source = generateReactComponent(schemaOf([question({})]));
      expect(source).not.toContain("<h2>");
      expect(source).toContain("<label>Question</label>");
    });

    it("renders flat questions when there are no sections at all", () => {
      const source = generateReactComponent(
        schemaOf([question({})], { sections: [] }),
      );
      expect(source).not.toContain("<h2>");
      expect(source).toContain("<label>Question</label>");
    });

    it("defaults the component name from the title", () => {
      const source = generateReactComponent(
        schemaOf([question({})], { title: "Contact us" }),
      );
      expect(source).toContain("export function ContactUsForm()");
    });

    it("does not embed the per-request fbzx token in the schema", () => {
      const source = generateReactComponent({
        ...schemaOf([question({})]),
        fbzx: "-1234567890123456789",
      });
      expect(source).not.toContain("fbzx");
      expect(source).not.toContain("-1234567890123456789");
    });
  });
});
