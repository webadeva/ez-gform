import type { FormSchema, Question } from "@ez-gform/types";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_SLUGS,
  loadFixtureSchema,
} from "../__test-utils__/fixtures.js";
import { generateHtmlForm } from "../generate-html.js";

const hasOtherOption = (question: Question): boolean => {
  return (
    question.options?.some((o) => {
      return o.isOther;
    }) ?? false
  );
};

/** Every distinct `name=` attribute value the encoder would produce for this schema. */
const expectedNames = (schema: FormSchema): Set<string> => {
  const names = new Set<string>();
  if (schema.multiPage) {
    names.add("fbzx");
    names.add("pageHistory");
    names.add("partialResponse");
  }
  for (const question of schema.questions) {
    switch (question.type) {
      case "short_answer":
      case "paragraph":
      case "linear_scale":
        names.add(question.entryId);
        break;
      case "multiple_choice":
      case "dropdown":
        names.add(question.entryId);
        if (hasOtherOption(question)) {
          names.add(`${question.entryId}.other_option_response`);
        }
        break;
      case "checkboxes":
        names.add(question.entryId);
        if (hasOtherOption(question)) {
          names.add(`${question.entryId}.other_option_response`);
        }
        break;
      case "grid":
      case "checkbox_grid":
        for (const row of question.rows ?? []) {
          names.add(row.entryId);
        }
        break;
      case "date":
        if (question.date?.includeYear !== false) {
          names.add(`${question.entryId}_year`);
        }
        names.add(`${question.entryId}_month`);
        names.add(`${question.entryId}_day`);
        if (question.date?.includeTime) {
          names.add(`${question.entryId}_hour`);
          names.add(`${question.entryId}_minute`);
        }
        break;
      case "time":
        names.add(`${question.entryId}_hour`);
        names.add(`${question.entryId}_minute`);
        if (question.time?.isDuration) {
          names.add(`${question.entryId}_second`);
        }
        break;
      case "file_upload":
        break;
      default:
        break;
    }
  }
  return names;
};

const extractNames = (html: string): Set<string> => {
  const names = new Set<string>();
  const re = /\bname="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    names.add(match[1]!);
  }
  return names;
};

describe("generateHtmlForm", () => {
  for (const slug of FIXTURE_SLUGS) {
    it(`emits exactly the expected entry names for ${slug}`, () => {
      const schema = loadFixtureSchema(slug);
      const html = generateHtmlForm(schema);
      const found = extractNames(html);
      const expected = expectedNames(schema);
      expect([...found].sort()).toEqual([...expected].sort());
    });
  }

  it("posts to the formResponse URL", () => {
    const schema = loadFixtureSchema("all-question-types");
    const html = generateHtmlForm(schema);
    expect(html).toContain(
      `action="https://docs.google.com/forms/d/e/${schema.formId}/formResponse"`,
    );
    expect(html).toContain('method="POST"');
  });
});

const makeQuestion = (overrides: Partial<Question>): Question => {
  return {
    id: "1",
    entryId: "entry.1",
    title: "Q",
    type: "short_answer",
    required: false,
    ...overrides,
  };
};

const makeSchema = (
  questions: Question[],
  overrides: Partial<FormSchema> = {},
): FormSchema => {
  return {
    formId: "1FAIpQLSsyntheticformid",
    title: "Synthetic",
    questions,
    sections: [],
    multiPage: false,
    ...overrides,
  };
};

const htmlFor = (
  question: Partial<Question>,
  schemaOverrides: Partial<FormSchema> = {},
): string => {
  return generateHtmlForm(
    makeSchema([makeQuestion(question)], schemaOverrides),
  );
};

describe("generateHtmlForm: required attribute", () => {
  it.each([
    ["short_answer", '<input type="text"'],
    ["paragraph", "<textarea"],
  ] as const)("marks a required %s as required", (type, tag) => {
    const html = htmlFor({ type, required: true });
    expect(html).toMatch(new RegExp(`${tag} name="entry.1" required>`));
    expect(html).toContain("<label>Q *</label>");
  });

  it.each(["short_answer", "paragraph", "dropdown"] as const)(
    "omits required on an optional %s",
    (type) => {
      const html = htmlFor({ type, required: false, options: [] });
      expect(html).not.toContain("required");
      expect(html).toContain("<label>Q</label>");
    },
  );

  it("marks a required dropdown's select as required", () => {
    const html = htmlFor({
      type: "dropdown",
      required: true,
      options: [{ value: "One", isOther: false }],
    });
    expect(html).toContain(
      '<select name="entry.1" required>\n  <option value="" disabled selected>Choose</option>\n  <option value="One">One</option>',
    );
  });

  it("marks every radio of a required multiple_choice and linear_scale as required", () => {
    const mc = htmlFor({
      type: "multiple_choice",
      required: true,
      options: [
        { value: "A", isOther: false },
        { value: "", isOther: true },
      ],
    });
    expect(mc).toContain("<label>Q *</label>");
    expect(mc).toContain('name="entry.1" value="A" required>');
    expect(mc).toContain('value="__other_option__" required>');
    const scale = htmlFor({
      type: "linear_scale",
      required: true,
      scale: { min: 1, max: 2 },
    });
    expect(scale.match(/type="radio"[^>]* required>/g)).toHaveLength(2);
  });

  it("marks each row's radios of a required grid as required", () => {
    const html = htmlFor({
      type: "grid",
      required: true,
      options: [{ value: "X", isOther: false }],
      rows: [{ entryId: "entry.1", label: "R" }],
    });
    expect(html).toContain(
      '<input type="radio" name="entry.1" value="X" required>',
    );
  });

  it("keeps checkboxes and checkbox grids without required (no native at-least-one)", () => {
    const cb = htmlFor({
      type: "checkboxes",
      required: true,
      options: [{ value: "A", isOther: false }],
    });
    expect(cb).toContain("<label>Q *</label>");
    expect(cb).not.toContain("required");
    const cbg = htmlFor({
      type: "checkbox_grid",
      required: true,
      options: [{ value: "X", isOther: false }],
      rows: [{ entryId: "entry.1", label: "R" }],
    });
    expect(cbg).not.toContain("required");
  });

  it("marks date and time inputs as required", () => {
    const date = htmlFor({
      type: "date",
      required: true,
      date: { includeTime: true, includeYear: true },
    });
    expect(date.match(/type="number"[^>]* required>/g)).toHaveLength(5);
    const time = htmlFor({ type: "time", required: true });
    expect(time.match(/type="number"[^>]* required>/g)).toHaveLength(2);
    expect(htmlFor({ type: "time" })).not.toContain("required");
  });
});

describe("generateHtmlForm: escaping", () => {
  it("escapes & < > and double quotes in titles, option values and grid labels", () => {
    const nasty = `A & B <i> "q"`;
    const escaped = "A &amp; B &lt;i&gt; &quot;q&quot;";
    const html = generateHtmlForm(
      makeSchema(
        [
          makeQuestion({ title: nasty }),
          makeQuestion({
            entryId: "entry.2",
            type: "multiple_choice",
            options: [{ value: nasty, isOther: false }],
          }),
          makeQuestion({
            entryId: "entry.3",
            type: "dropdown",
            options: [{ value: nasty, isOther: false }],
          }),
          makeQuestion({
            entryId: "entry.4",
            type: "grid",
            options: [{ value: nasty, isOther: false }],
            rows: [{ entryId: "entry.4", label: nasty }],
          }),
        ],
        { title: nasty },
      ),
    );
    expect(html).toContain(`<!-- ${escaped} -->`);
    expect(html).toContain(`<label>${escaped}</label>`);
    expect(html).toContain(`value="${escaped}"> ${escaped}</label>`);
    expect(html).toContain(`<option value="${escaped}">${escaped}</option>`);
    expect(html).toContain(`<th>${escaped}</th>`);
    expect(html).not.toContain("<i>");
    expect(html).not.toContain(nasty);
  });

  it("cannot be closed early by a title containing the comment terminator", () => {
    const html = generateHtmlForm(makeSchema([], { title: "x --> <script>" }));
    expect(html.startsWith("<!-- x --&gt; &lt;script&gt; -->\n")).toBe(true);
  });

  // Every generated attribute is delimited by double quotes, so a single quote
  // inside a value cannot terminate an attribute: leaving it unescaped is
  // harmless (the integration test also round-trips such a value).
  it("leaves single quotes untouched, which is safe inside double-quoted attributes", () => {
    const html = generateHtmlForm(
      makeSchema([
        makeQuestion({
          title: "It's",
          type: "multiple_choice",
          options: [{ value: "O'Neil", isOther: false }],
        }),
      ]),
    );
    expect(html).toContain("<label>It's</label>");
    expect(html).toContain('value="O\'Neil"');
  });

  it("renders escaped question and form descriptions as paragraphs", () => {
    const html = htmlFor(
      { description: "Secret <b>help</b>" },
      { description: "Form & <i>intro</i>" },
    );
    expect(html).toContain(
      "<label>Q</label>\n<p>Secret &lt;b&gt;help&lt;/b&gt;</p>\n<input",
    );
    expect(html).toContain("<p>Form &amp; &lt;i&gt;intro&lt;/i&gt;</p>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(htmlFor({})).not.toContain("<p>");
  });
});

describe("generateHtmlForm: question renderers", () => {
  it("renders dropdown options and handles a missing options array", () => {
    const html = htmlFor({
      type: "dropdown",
      options: [
        { value: "One", isOther: false },
        { value: "Two", isOther: false },
      ],
    });
    expect(html).toContain(
      '<select name="entry.1">\n  <option value="" selected></option>\n  <option value="One">One</option>\n  <option value="Two">Two</option>\n</select>',
    );
    expect(htmlFor({ type: "dropdown" })).toContain(
      '<select name="entry.1">\n  <option value="" selected></option>\n</select>',
    );
  });

  it("renders radio and checkbox Other choices with a text field", () => {
    const options = [
      { value: "Red", isOther: false },
      { value: "", isOther: true },
    ];
    const radio = htmlFor({ type: "multiple_choice", options });
    expect(radio).toContain(
      '<input type="radio" name="entry.1" value="__other_option__"> Other:',
    );
    expect(radio).toContain(
      '<input type="text" name="entry.1.other_option_response">',
    );
    const checkbox = htmlFor({ type: "checkboxes", options });
    expect(checkbox).toContain(
      '<input type="checkbox" name="entry.1" value="Red">',
    );
    expect(checkbox).toContain(
      '<input type="checkbox" name="entry.1" value="__other_option__">',
    );
  });

  it("renders no choices when options are missing", () => {
    expect(htmlFor({ type: "multiple_choice" })).toBe(
      htmlFor({ type: "multiple_choice", options: [] }),
    );
    expect(htmlFor({ type: "multiple_choice" })).not.toContain("<input");
  });

  it("renders linear scale from min to max", () => {
    const html = htmlFor({ type: "linear_scale", scale: { min: 0, max: 2 } });
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('<input type="radio" name="entry.1" value="0"> 0');
    expect(html).toContain('value="2"> 2');
    expect(html).not.toContain('value="3"');
  });

  it("defaults linear scale to 1..5 when scale is missing", () => {
    const html = htmlFor({ type: "linear_scale" });
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html).toContain('value="1"');
    expect(html).toContain('value="5"');
    expect(html).not.toContain('value="0"');
    expect(html).not.toContain('value="6"');
  });

  it("renders grid rows as radios and checkbox_grid rows as checkboxes", () => {
    const base = {
      options: [
        { value: "Lo", isOther: false },
        { value: "Hi", isOther: false },
      ],
      rows: [
        { entryId: "entry.10", label: "R1" },
        { entryId: "entry.11", label: "R2" },
      ],
    };
    const grid = htmlFor({ type: "grid", ...base });
    expect(grid).toContain(
      '<tr><th>R1</th><td><input type="radio" name="entry.10" value="Lo"></td><td><input type="radio" name="entry.10" value="Hi"></td></tr>',
    );
    expect(grid).toContain('name="entry.11"');
    const checks = htmlFor({ type: "checkbox_grid", ...base });
    expect(checks).toContain(
      '<input type="checkbox" name="entry.10" value="Lo">',
    );
    expect(checks).not.toContain('type="radio"');
  });

  it("renders an empty grid table when rows and options are missing", () => {
    expect(htmlFor({ type: "grid" })).toContain("<table>\n\n</table>");
  });

  it("renders date parts according to includeYear and includeTime", () => {
    const names = (html: string): string[] => {
      return [...html.matchAll(/name="entry\.1(_\w+)"/g)].map((m) => {
        return m[1]!;
      });
    };
    expect(names(htmlFor({ type: "date" }))).toEqual([
      "_year",
      "_month",
      "_day",
    ]);
    expect(
      names(
        htmlFor({
          type: "date",
          date: { includeYear: false, includeTime: false },
        }),
      ),
    ).toEqual(["_month", "_day"]);
    expect(
      names(
        htmlFor({
          type: "date",
          date: { includeYear: true, includeTime: true },
        }),
      ),
    ).toEqual(["_year", "_month", "_day", "_hour", "_minute"]);
    expect(
      names(
        htmlFor({
          type: "date",
          date: { includeYear: false, includeTime: true },
        }),
      ),
    ).toEqual(["_month", "_day", "_hour", "_minute"]);
  });

  it("renders time as hour and minute inputs", () => {
    const html = htmlFor({ type: "time" });
    expect(html).toContain('name="entry.1_hour" placeholder="Hour"');
    expect(html).toContain('name="entry.1_minute" placeholder="Minute"');
  });

  it("adds a second input only for a duration", () => {
    const clock = htmlFor({ type: "time", time: { isDuration: false } });
    expect(clock).not.toContain("_second");
    const duration = htmlFor({
      type: "time",
      required: true,
      time: { isDuration: true },
    });
    expect(duration).toContain('name="entry.1_hour" placeholder="Hour"');
    expect(duration).toContain('name="entry.1_minute" placeholder="Minute"');
    expect(duration).toContain('name="entry.1_second" placeholder="Second"');
    expect(duration.match(/type="number"[^>]* required>/g)).toHaveLength(3);
  });

  it("renders only a comment for file_upload", () => {
    const html = htmlFor({ type: "file_upload", required: true });
    expect(html).toContain("<!-- file_upload is not supported");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('name="entry.1"');
  });

  it("falls back to just the label for an unknown question type", () => {
    const html = htmlFor({ type: "mystery" as Question["type"] });
    expect(html).toContain("<label>Q</label>\n\n<button");
    expect(html).not.toContain('name="entry.1"');
  });
});

describe("generateHtmlForm: form wrapper", () => {
  it("uses a placeholder form id when formId is empty", () => {
    const html = generateHtmlForm(makeSchema([], { formId: "" }));
    expect(html).toContain(
      'action="https://docs.google.com/forms/d/e/REPLACE_WITH_FORM_ID/formResponse"',
    );
  });

  it("emits fbzx, pageHistory and partialResponse only for multi-page forms", () => {
    const single = generateHtmlForm(makeSchema([]));
    for (const name of ["fbzx", "pageHistory", "partialResponse"]) {
      expect(single).not.toContain(name);
    }
    const multi = generateHtmlForm(makeSchema([], { multiPage: true }));
    expect(multi).toContain(
      '<input type="hidden" name="fbzx" value="-1000000000000000000">',
    );
    expect(multi).toContain(
      '<input type="hidden" name="pageHistory" value="0">',
    );
    expect(multi).toContain(
      '<input type="hidden" name="partialResponse" value="[null,null,&quot;-1000000000000000000&quot;]">',
    );
    const sections = ["a", "b", "c"].map((title) => {
      return { title, questionIds: [] };
    });
    expect(
      generateHtmlForm(makeSchema([], { multiPage: true, sections })),
    ).toContain('name="pageHistory" value="0,1,2"');
  });

  it("never leaks the schema's per-request fbzx", () => {
    const html = generateHtmlForm(
      makeSchema([], { multiPage: true, fbzx: "-1234567890123456789" }),
    );
    expect(html).not.toContain("-1234567890123456789");
  });

  it("ends with a submit button and closes the form", () => {
    const html = generateHtmlForm(makeSchema([]));
    expect(html).toContain('<button type="submit">Submit</button>\n</form>\n');
  });
});
