import type { Question, Section } from "@ez-gform/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ParseError } from "../errors.js";
import { parseFormData, parseFormHtml } from "../parse.js";

const fixturesDir = fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const loadFixture = (slug: string): unknown => {
  return JSON.parse(readFileSync(`${fixturesDir}${slug}.json`, "utf8"));
};

type Raw = unknown[];

const cloneFixture = (): Raw => {
  return structuredClone(loadFixture("all-question-types")) as Raw;
};

const container = (data: Raw): Raw => {
  return data[1] as Raw;
};

const findEntry = (data: Raw, title: string): Raw => {
  const entry = (container(data)[1] as Raw[]).find((e) => {
    return e[1] === title;
  });
  if (!entry) throw new Error(`fixture has no item titled ${title}`);
  return entry;
};

const subQuestions = (data: Raw, title: string): Raw[] => {
  return findEntry(data, title)[4] as Raw[];
};

const ALL_TYPES_QUESTIONS: Question[] = [
  {
    id: "1766845390",
    entryId: "entry.2028813558",
    title: "Short answer required",
    description: "A description under the title",
    type: "short_answer",
    required: true,
  },
  {
    id: "923237468",
    entryId: "entry.758594018",
    title: "Short answer optional",
    type: "short_answer",
    required: false,
  },
  {
    id: "1038804137",
    entryId: "entry.2040941268",
    title: "Paragraph question",
    type: "paragraph",
    required: false,
  },
  {
    id: "1209267714",
    entryId: "entry.1536687708",
    title: "Radio plain",
    type: "multiple_choice",
    required: true,
    options: [
      {
        value: "Alpha",
        isOther: false,
      },
      {
        value: "Beta",
        isOther: false,
      },
      {
        value: "Gamma",
        isOther: false,
      },
    ],
  },
  {
    id: "1405317756",
    entryId: "entry.982140529",
    title: "Radio with other",
    type: "multiple_choice",
    required: false,
    options: [
      {
        value: "Red",
        isOther: false,
      },
      {
        value: "Green",
        isOther: false,
      },
      {
        value: "",
        isOther: true,
      },
    ],
  },
  {
    id: "1289230657",
    entryId: "entry.1985580588",
    title: "Dropdown question",
    type: "dropdown",
    required: true,
    options: [
      {
        value: "One",
        isOther: false,
      },
      {
        value: "Two",
        isOther: false,
      },
      {
        value: "Three",
        isOther: false,
      },
    ],
  },
  {
    id: "748437241",
    entryId: "entry.425514760",
    title: "Checkboxes plain",
    type: "checkboxes",
    required: false,
    options: [
      {
        value: "Apple",
        isOther: false,
      },
      {
        value: "Banana",
        isOther: false,
      },
      {
        value: "Cherry",
        isOther: false,
      },
    ],
  },
  {
    id: "991128912",
    entryId: "entry.1932922730",
    title: "Checkboxes with other",
    type: "checkboxes",
    required: false,
    options: [
      {
        value: "Cat",
        isOther: false,
      },
      {
        value: "Dog",
        isOther: false,
      },
      {
        value: "",
        isOther: true,
      },
    ],
  },
  {
    id: "1307541786",
    entryId: "entry.1304572283",
    title: "Checkboxes with validation",
    type: "checkboxes",
    required: true,
    options: [
      {
        value: "A",
        isOther: false,
      },
      {
        value: "B",
        isOther: false,
      },
      {
        value: "C",
        isOther: false,
      },
      {
        value: "D",
        isOther: false,
      },
    ],
  },
  {
    id: "877872978",
    entryId: "entry.1044963262",
    title: "Scale with labels",
    type: "linear_scale",
    required: true,
    scale: {
      min: 1,
      max: 5,
      lowLabel: "Bad",
      highLabel: "Great",
    },
  },
  {
    id: "701734740",
    entryId: "entry.1170777339",
    title: "Scale without labels",
    type: "linear_scale",
    required: false,
    scale: {
      min: 0,
      max: 10,
    },
  },
  {
    id: "715245711",
    entryId: "entry.1697966657",
    title: "Radio grid",
    type: "grid",
    required: true,
    rows: [
      {
        entryId: "entry.1697966657",
        label: "Row A",
      },
      {
        entryId: "entry.258902491",
        label: "Row B",
      },
    ],
    options: [
      {
        value: "Low",
        isOther: false,
      },
      {
        value: "Mid",
        isOther: false,
      },
      {
        value: "High",
        isOther: false,
      },
    ],
  },
  {
    id: "1338334946",
    entryId: "entry.126163357",
    title: "Checkbox grid",
    type: "checkbox_grid",
    required: false,
    rows: [
      {
        entryId: "entry.126163357",
        label: "Row X",
      },
      {
        entryId: "entry.2074821697",
        label: "Row Y",
      },
    ],
    options: [
      {
        value: "Morning",
        isOther: false,
      },
      {
        value: "Evening",
        isOther: false,
      },
    ],
  },
  {
    id: "1541773487",
    entryId: "entry.1396158763",
    title: "Rating question",
    type: "linear_scale",
    required: false,
    scale: {
      min: 1,
      max: 5,
    },
  },
  {
    id: "654408525",
    entryId: "entry.1384108908",
    title: "Date with year",
    type: "date",
    required: true,
    date: {
      includeTime: false,
      includeYear: true,
    },
  },
  {
    id: "161240750",
    entryId: "entry.1217411270",
    title: "Date with year and time",
    type: "date",
    required: false,
    date: {
      includeTime: true,
      includeYear: true,
    },
  },
  {
    id: "965019742",
    entryId: "entry.309193780",
    title: "Date without year",
    type: "date",
    required: false,
    date: {
      includeTime: false,
      includeYear: false,
    },
  },
  {
    id: "2131757229",
    entryId: "entry.2139776196",
    title: "Date with time without year",
    type: "date",
    required: false,
    date: {
      includeTime: true,
      includeYear: false,
    },
  },
  {
    id: "1009907991",
    entryId: "entry.1979251707",
    title: "Time of day",
    type: "time",
    required: false,
    time: {
      isDuration: false,
    },
  },
  {
    id: "619670915",
    entryId: "entry.1454464036",
    title: "Duration",
    type: "time",
    required: false,
    time: {
      isDuration: true,
    },
  },
];

const ALL_TYPES_SECTIONS: Section[] = [
  {
    title: "Info block",
    description: "This block has no input. Questions? contact@example.com",
    questionIds: [
      "1766845390",
      "923237468",
      "1038804137",
      "1209267714",
      "1405317756",
      "1289230657",
      "748437241",
      "991128912",
      "1307541786",
    ],
  },
  {
    title: "Scales and grids",
    description: "Second page",
    questionIds: [
      "877872978",
      "701734740",
      "715245711",
      "1338334946",
      "1541773487",
    ],
  },
  {
    title: "Dates and times",
    questionIds: [
      "654408525",
      "161240750",
      "965019742",
      "2131757229",
      "1009907991",
      "619670915",
    ],
  },
  {
    title: "Media",
    questionIds: [],
  },
];

const FILE_UPLOAD_QUESTIONS: Question[] = [
  {
    id: "750178684",
    entryId: "entry.83696370",
    title: "Upload question",
    type: "file_upload",
    required: true,
  },
  {
    id: "1219428971",
    entryId: "entry.1038595481",
    title: "Name",
    type: "short_answer",
    required: false,
  },
];

const FIXTURE_SLUGS = ["all-question-types", "file-upload"] as const;

describe("parseFormData over every live fixture", () => {
  for (const slug of FIXTURE_SLUGS) {
    it(`parses ${slug} without throwing and returns a sane schema`, () => {
      const data = loadFixture(slug);
      const schema = parseFormData(data);

      expect(schema.formId.length).toBeGreaterThan(0);
      expect(schema.formId.startsWith("e/")).toBe(false);
      expect(typeof schema.title).toBe("string");
      expect(schema.title.length).toBeGreaterThan(0);
      expect(Array.isArray(schema.questions)).toBe(true);
      expect(schema.questions.length).toBeGreaterThan(0);
      expect(Array.isArray(schema.sections)).toBe(true);
      expect(schema.sections.length).toBeGreaterThan(0);

      for (const q of schema.questions) {
        expect(q.entryId.startsWith("entry.")).toBe(true);
        expect(typeof q.required).toBe("boolean");
      }
    });
  }
});

describe("parseFormData — all-question-types", () => {
  const schema = parseFormData(loadFixture("all-question-types"));
  const byTitle = (title: string) => {
    return schema.questions.find((q) => {
      return q.title === title;
    });
  };

  it("reads form title, description, and id", () => {
    expect(schema.title).toBe("ez-gform fixture: all question types");
    expect(schema.description).toBe(
      "Synthetic form used as a parser test fixture.",
    );
    expect(schema.formId).toBe(
      "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw",
    );
  });

  it("maps every question to its type, in order", () => {
    expect(
      schema.questions.map((q) => {
        return [q.title, q.type];
      }),
    ).toEqual([
      ["Short answer required", "short_answer"],
      ["Short answer optional", "short_answer"],
      ["Paragraph question", "paragraph"],
      ["Radio plain", "multiple_choice"],
      ["Radio with other", "multiple_choice"],
      ["Dropdown question", "dropdown"],
      ["Checkboxes plain", "checkboxes"],
      ["Checkboxes with other", "checkboxes"],
      ["Checkboxes with validation", "checkboxes"],
      ["Scale with labels", "linear_scale"],
      ["Scale without labels", "linear_scale"],
      ["Radio grid", "grid"],
      ["Checkbox grid", "checkbox_grid"],
      ["Rating question", "linear_scale"],
      ["Date with year", "date"],
      ["Date with year and time", "date"],
      ["Date without year", "date"],
      ["Date with time without year", "date"],
      ["Time of day", "time"],
      ["Duration", "time"],
    ]);
  });

  it("splits page breaks into sections and skips non-question blocks", () => {
    expect(schema.multiPage).toBe(true);
    expect(
      schema.sections.map((s) => {
        return [s.title, s.questionIds.length];
      }),
    ).toEqual([
      // the "Info block" title item retitles the first section
      ["Info block", 9],
      ["Scales and grids", 5],
      ["Dates and times", 6],
      // image and video items are not questions
      ["Media", 0],
    ]);
    expect(schema.sections[1]?.description).toBe("Second page");
  });

  it("reads required flags and descriptions", () => {
    expect(byTitle("Short answer required")?.required).toBe(true);
    expect(byTitle("Short answer required")?.description).toBe(
      "A description under the title",
    );
    expect(byTitle("Short answer optional")?.required).toBe(false);
    expect(byTitle("Radio grid")?.required).toBe(true);
    expect(byTitle("Checkbox grid")?.required).toBe(false);
  });

  it("flags the Other option on radio and checkbox questions only", () => {
    expect(byTitle("Radio plain")?.options).toEqual([
      { value: "Alpha", isOther: false },
      { value: "Beta", isOther: false },
      { value: "Gamma", isOther: false },
    ]);
    expect(byTitle("Radio with other")?.options).toEqual([
      { value: "Red", isOther: false },
      { value: "Green", isOther: false },
      { value: "", isOther: true },
    ]);
    expect(byTitle("Checkboxes with other")?.options?.at(-1)).toEqual({
      value: "",
      isOther: true,
    });
  });

  it("parses options on a checkbox question carrying a validation rule", () => {
    expect(
      byTitle("Checkboxes with validation")?.options?.map((o) => {
        return o.value;
      }),
    ).toEqual(["A", "B", "C", "D"]);
  });

  it("parses linear scales with and without labels", () => {
    expect(byTitle("Scale with labels")?.scale).toEqual({
      min: 1,
      max: 5,
      lowLabel: "Bad",
      highLabel: "Great",
    });
    expect(byTitle("Scale without labels")?.scale).toEqual({
      min: 0,
      max: 10,
      lowLabel: undefined,
      highLabel: undefined,
    });
  });

  it("parses a rating question (type 18) as a 1..N scale", () => {
    expect(byTitle("Rating question")?.scale).toMatchObject({ min: 1, max: 5 });
  });

  it("parses both grid kinds distinctly, one entry id per row", () => {
    const grid = byTitle("Radio grid");
    const checkboxGrid = byTitle("Checkbox grid");
    expect(
      grid?.rows?.map((r) => {
        return r.label;
      }),
    ).toEqual(["Row A", "Row B"]);
    expect(
      grid?.options?.map((o) => {
        return o.value;
      }),
    ).toEqual(["Low", "Mid", "High"]);
    expect(
      checkboxGrid?.rows?.map((r) => {
        return r.label;
      }),
    ).toEqual(["Row X", "Row Y"]);
    expect(grid?.entryId).toBe(grid?.rows?.[0]?.entryId);
    expect(grid?.rows?.[0]?.entryId).not.toBe(grid?.rows?.[1]?.entryId);
  });

  it("parses all four [includeTime, includeYear] date flag pairs", () => {
    expect(byTitle("Date with year")?.date).toEqual({
      includeTime: false,
      includeYear: true,
    });
    expect(byTitle("Date with year and time")?.date).toEqual({
      includeTime: true,
      includeYear: true,
    });
    expect(byTitle("Date without year")?.date).toEqual({
      includeTime: false,
      includeYear: false,
    });
    expect(byTitle("Date with time without year")?.date).toEqual({
      includeTime: true,
      includeYear: false,
    });
  });

  it("distinguishes time of day from duration", () => {
    expect(byTitle("Time of day")?.time).toEqual({ isDuration: false });
    expect(byTitle("Duration")?.time).toEqual({ isDuration: true });
  });
});

describe("parseFormData — file-upload", () => {
  const schema = parseFormData(loadFixture("file-upload"));

  it("parses a type-13 file upload question on a single-page form", () => {
    expect(schema.multiPage).toBe(false);
    expect(schema.sections).toHaveLength(1);
    expect(schema.questions[0]).toMatchObject({
      title: "Upload question",
      type: "file_upload",
      required: true,
    });
  });
});

describe("parseFormData — error handling", () => {
  it("throws ParseError on non-array input", () => {
    expect(() => {
      return parseFormData({});
    }).toThrow(ParseError);
  });

  it("throws ParseError when data[1] is missing", () => {
    expect(() => {
      return parseFormData([null]);
    }).toThrow(ParseError);
  });

  it("throws ParseError on unknown question type code", () => {
    const bad = [null, [null, [[1, "Title", null, 999, null]]], null, "Title"];
    expect(() => {
      return parseFormData(bad);
    }).toThrow(ParseError);
  });
});

describe("parseFormHtml", () => {
  it("extracts and parses all-question-types.html end to end", () => {
    const html = readFileSync(`${fixturesDir}all-question-types.html`, "utf8");
    const schema = parseFormHtml(html);
    expect(schema.title).toBe("ez-gform fixture: all question types");
    expect(schema.multiPage).toBe(true);
    expect(schema.questions).toHaveLength(20);
    expect(schema.fbzx).toBeDefined();
  });
});

describe("parseFormData — full schema shape", () => {
  it("matches the fixture README item by item for all-question-types", () => {
    const schema = parseFormData(loadFixture("all-question-types"));
    expect(schema.questions).toHaveLength(ALL_TYPES_QUESTIONS.length);
    ALL_TYPES_QUESTIONS.forEach((expected, i) => {
      expect(schema.questions[i]).toEqual(expected);
    });
    expect(schema.sections).toEqual(ALL_TYPES_SECTIONS);
    expect(schema.formId).toBe(
      "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw",
    );
    expect(schema.title).toBe("ez-gform fixture: all question types");
    expect(schema.description).toBe(
      "Synthetic form used as a parser test fixture.",
    );
    expect(schema.multiPage).toBe(true);
    expect(schema.fbzx).toBeUndefined();
  });

  it("matches the full schema for file-upload", () => {
    const schema = parseFormData(loadFixture("file-upload"));
    expect(schema).toEqual({
      formId: "1FAIpQLSfREd_C7AwV7IR5sGJjSXoleJi-zXtaSFVPPLyI8hqOb0ILhA",
      title: "ez-gform fixture: file upload",
      questions: FILE_UPLOAD_QUESTIONS,
      sections: [
        {
          title: "ez-gform fixture: file upload",
          questionIds: ["750178684", "1219428971"],
        },
      ],
      multiPage: false,
    });
  });

  it("parseFormHtml yields the same schema plus fbzx", () => {
    const html = readFileSync(`${fixturesDir}all-question-types.html`, "utf8");
    const fromData = parseFormData(loadFixture("all-question-types"));
    expect(parseFormHtml(html)).toEqual({
      ...fromData,
      fbzx: "-501218452535699008",
    });
  });

  it("parseFormHtml omits fbzx when the page has no fbzx input", () => {
    const html = readFileSync(`${fixturesDir}all-question-types.html`, "utf8");
    const stripped = html.replace(/<input[^>]*name="fbzx"[^>]*>/, "");
    expect(stripped).not.toContain('name="fbzx"');
    const schema = parseFormHtml(stripped);
    expect("fbzx" in schema).toBe(false);
    expect(schema.questions).toHaveLength(20);
  });
});

describe("parseFormData — fallbacks on mutated live fixture", () => {
  it("reads the title from a [null, title] wrapper at data[1][8]", () => {
    const data = cloneFixture();
    container(data)[8] = [null, "Wrapped title"];
    expect(parseFormData(data).title).toBe("Wrapped title");
  });

  it("falls back to data[3] when data[1][8] is not usable", () => {
    const data = cloneFixture();
    container(data)[8] = null;
    expect(parseFormData(data).title).toBe("Untitled form");
    container(data)[8] = [null, 42];
    expect(parseFormData(data).title).toBe("Untitled form");
  });

  it("falls back to an empty title when neither title source is a string", () => {
    const data = cloneFixture();
    container(data)[8] = undefined;
    data[3] = null;
    const schema = parseFormData(data);
    expect(schema.title).toBe("");
    expect(schema.sections[0]?.title).toBe("Info block");
  });

  it("prefers opts.formId over data[14]", () => {
    expect(parseFormData(cloneFixture(), { formId: "custom-id" }).formId).toBe(
      "custom-id",
    );
  });

  it("keeps a data[14] that has no e/ prefix as is", () => {
    const data = cloneFixture();
    data[14] = "plainId";
    expect(parseFormData(data).formId).toBe("plainId");
  });

  it("uses an empty formId when data[14] is not a string", () => {
    const data = cloneFixture();
    data[14] = 12345;
    expect(parseFormData(data).formId).toBe("");
  });

  it("lets a type-6 section header overwrite the first section", () => {
    const data = cloneFixture();
    const header = findEntry(data, "Info block");
    header[1] = "Retitled";
    header[2] = "Retitled description";
    const first = parseFormData(data).sections[0];
    expect(first?.title).toBe("Retitled");
    expect(first?.description).toBe("Retitled description");
  });

  it("yields NaN min/max for a linear scale with no options", () => {
    const data = cloneFixture();
    subQuestions(data, "Scale without labels")[0]![1] = null;
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Scale without labels";
    });
    expect(q?.scale?.min).toBeNaN();
    expect(q?.scale?.max).toBeNaN();
  });

  it("uses an empty label for a grid row with no label", () => {
    const data = cloneFixture();
    subQuestions(data, "Radio grid")[1]![3] = null;
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Radio grid";
    });
    expect(q?.rows?.[0]?.label).toBe("Row A");
    expect(q?.rows?.[1]?.label).toBe("");
  });

  it("defaults a date with no flags to includeYear true, includeTime false", () => {
    const data = cloneFixture();
    subQuestions(data, "Date with year")[0]![7] = null;
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Date with year";
    });
    expect(q?.date).toEqual({ includeTime: false, includeYear: true });
  });

  it("treats a time with no flags as time of day", () => {
    const data = cloneFixture();
    subQuestions(data, "Duration")[0]![6] = null;
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Duration";
    });
    expect(q?.time).toEqual({ isDuration: false });
  });

  it("maps a non-array option tuple or non-string value to an empty value", () => {
    const data = cloneFixture();
    const sub = subQuestions(data, "Radio plain")[0]!;
    sub[1] = ["not-a-tuple", [7], ["Real"]];
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Radio plain";
    });
    expect(q?.options).toEqual([
      { value: "", isOther: false },
      { value: "", isOther: false },
      { value: "Real", isOther: false },
    ]);
  });

  it("leaves options undefined when a choice question has no option list", () => {
    const data = cloneFixture();
    subQuestions(data, "Radio plain")[0]![1] = null;
    const q = parseFormData(data).questions.find((x) => {
      return x.title === "Radio plain";
    });
    expect(q?.options).toBeUndefined();
  });
});

describe("parseFormData — malformed input", () => {
  const wrap = (entries: unknown): unknown => {
    return [null, [null, entries], null, "T", null, null, null, null, null];
  };

  it("throws when data[1][1] is not an array", () => {
    expect(() => {
      return parseFormData([null, [null, "nope"], null, "T"]);
    }).toThrow(
      new ParseError(
        "parseFormData: expected data[1][1] (question list) to be an array",
      ),
    );
  });

  it("throws when a question entry is not an array", () => {
    expect(() => {
      return parseFormData(wrap(["oops"]));
    }).toThrow(
      new ParseError(
        "parseFormData: expected an array at question entry, got string",
      ),
    );
  });

  it("throws when question[4] is not an array", () => {
    expect(() => {
      return parseFormData(wrap([[1, "Q", null, 0, null]]));
    }).toThrow(
      new ParseError(
        "parseFormData: expected an array at question[4], got object",
      ),
    );
  });

  it("throws when a sub-question entry is not an array", () => {
    expect(() => {
      return parseFormData(wrap([[1, "Q", null, 0, ["x"]]]));
    }).toThrow(
      new ParseError(
        "parseFormData: expected an array at question[4][i], got string",
      ),
    );
  });

  it("throws on a non-numeric type code", () => {
    expect(() => {
      return parseFormData(wrap([[7, "Q", null, "0", [[1]]]]));
    }).toThrow(
      new ParseError("parseFormData: question 7 has a non-numeric type code"),
    );
  });

  it("throws on an empty sub-question array", () => {
    expect(() => {
      return parseFormData(wrap([[9, "Q", null, 0, []]]));
    }).toThrow(
      new ParseError(
        "parseFormData: question 9 (type 0) has no sub-question entries",
      ),
    );
  });

  it("throws a ParseError (not a TypeError) for every error path", () => {
    for (const bad of [wrap("x"), wrap(["x"]), wrap([[1, "Q", null, 0, 5]])]) {
      expect(() => {
        return parseFormData(bad);
      }).toThrow(ParseError);
    }
  });
});
