import type {
  DateValue,
  FieldValue,
  FormSchema,
  FormValues,
  Question,
  TimeValue,
  ValidationIssue,
} from "@ez-gform/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeValues, validateValues } from "../encode.js";
import { parseFormData } from "../parse.js";

const fixturesDir = fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const loadFixture = (slug: string): unknown => {
  return JSON.parse(readFileSync(`${fixturesDir}${slug}.json`, "utf8"));
};

describe("encodeValues — scalar text/number", () => {
  it("encodes a plain string", () => {
    const params = encodeValues({ "entry.1": "hello world" });
    expect(params.get("entry.1")).toBe("hello world");
  });

  it("encodes a number", () => {
    const params = encodeValues({ "entry.1": 5 });
    expect(params.get("entry.1")).toBe("5");
  });

  it("skips null, undefined, and empty string", () => {
    const params = encodeValues({
      "entry.1": null,
      "entry.2": undefined,
      "entry.3": "",
    });
    expect([...params.keys()]).toHaveLength(0);
  });

  it("preserves unicode and & / = characters via URLSearchParams (never hand-encoded)", () => {
    const params = encodeValues({ "entry.1": "héllo & wörld = ok 日本語" });
    expect(params.get("entry.1")).toBe("héllo & wörld = ok 日本語");
    expect(params.toString()).toContain("entry.1=");
    expect(params.toString()).not.toContain("héllo & wörld"); // must be percent-encoded in the serialized form
  });
});

describe("encodeValues — checkbox multi-value (string[])", () => {
  it("repeats the same entry.N", () => {
    const params = encodeValues({ "entry.1": ["A", "B", "C"] });
    expect(params.getAll("entry.1")).toEqual(["A", "B", "C"]);
  });

  it("emits nothing for an empty checkbox array", () => {
    const params = encodeValues({ "entry.1": [] });
    expect([...params.keys()]).toHaveLength(0);
  });
});

describe("encodeValues — 'Other' option", () => {
  it("encodes a single OtherValue", () => {
    const params = encodeValues({ "entry.1": { other: "my custom answer" } });
    expect(params.get("entry.1")).toBe("__other_option__");
    expect(params.get("entry.1.other_option_response")).toBe(
      "my custom answer",
    );
  });

  it("encodes an array mixing strings and OtherValue (checkbox + other)", () => {
    const params = encodeValues({ "entry.1": ["A", { other: "custom" }] });
    expect(params.getAll("entry.1")).toEqual(["A", "__other_option__"]);
    expect(params.get("entry.1.other_option_response")).toBe("custom");
  });
});

describe("encodeValues — date", () => {
  it("encodes year/month/day", () => {
    const params = encodeValues({
      "entry.1": { year: 2026, month: 9, day: 16 },
    });
    expect(params.get("entry.1_year")).toBe("2026");
    expect(params.get("entry.1_month")).toBe("9");
    expect(params.get("entry.1_day")).toBe("16");
  });

  it("omits _year when year is undefined", () => {
    const params = encodeValues({ "entry.1": { month: 9, day: 16 } });
    expect(params.has("entry.1_year")).toBe(false);
    expect(params.get("entry.1_month")).toBe("9");
    expect(params.get("entry.1_day")).toBe("16");
  });

  it("does not zero-pad month/day (Google accepts unpadded values)", () => {
    const params = encodeValues({
      "entry.1": { year: 2026, month: 9, day: 7 },
    });
    expect(params.get("entry.1_month")).toBe("9");
    expect(params.get("entry.1_day")).toBe("7");
  });

  it("zero-pads hour/minute when a date value also carries a time, like the TimeValue branch", () => {
    const params = encodeValues({
      "entry.1": { year: 2026, month: 9, day: 17, hour: 9, minute: 5 },
    });
    expect(params.get("entry.1_hour")).toBe("09");
    expect(params.get("entry.1_minute")).toBe("05");
  });
});

describe("encodeValues — time (zero-padded)", () => {
  it("zero-pads hour and minute to 2 digits", () => {
    const params = encodeValues({ "entry.1": { hour: 8, minute: 5 } });
    expect(params.get("entry.1_hour")).toBe("08");
    expect(params.get("entry.1_minute")).toBe("05");
  });

  it("does not pad already-2-digit values", () => {
    const params = encodeValues({ "entry.1": { hour: 23, minute: 59 } });
    expect(params.get("entry.1_hour")).toBe("23");
    expect(params.get("entry.1_minute")).toBe("59");
  });

  it("pads a bare TimeValue the same as a DateValue carrying hour/minute", () => {
    const timeOnly = encodeValues({ "entry.1": { hour: 9, minute: 5 } });
    const dateWithTime = encodeValues({
      "entry.1": { year: 2026, month: 9, day: 17, hour: 9, minute: 5 },
    });
    expect(timeOnly.get("entry.1_hour")).toBe("09");
    expect(timeOnly.get("entry.1_minute")).toBe("05");
    expect(dateWithTime.get("entry.1_hour")).toBe(timeOnly.get("entry.1_hour"));
    expect(dateWithTime.get("entry.1_minute")).toBe(
      timeOnly.get("entry.1_minute"),
    );
  });
});

describe("encodeValues — grid row maps", () => {
  it("encodes each row's own entry.N for a radio grid", () => {
    const params = encodeValues({
      "entry.1": { "entry.10": "Agree", "entry.11": "Disagree" },
    });
    expect(params.get("entry.10")).toBe("Agree");
    expect(params.get("entry.11")).toBe("Disagree");
    expect(params.has("entry.1")).toBe(false);
  });

  it("encodes repeated entry.N per row for a checkbox grid (row -> string[])", () => {
    const params = encodeValues({
      "entry.1": { "entry.10": ["Japan", "Canada"] },
    });
    expect(params.getAll("entry.10")).toEqual(["Japan", "Canada"]);
  });

  it("also supports row entryIds passed directly at the top level", () => {
    const params = encodeValues({ "entry.10": "Agree" });
    expect(params.get("entry.10")).toBe("Agree");
  });

  it("encodes a live grid fixture identically via nested row map or flat row ids", () => {
    const schema = parseFormData(loadFixture("all-question-types"));
    const grid = schema.questions.find((q) => {
      return q.title === "Radio grid";
    });
    const rows = grid?.rows ?? [];
    expect(rows.length).toBeGreaterThan(1);
    const [rowA, rowB] = rows;

    const nested = encodeValues({
      [grid!.entryId]: {
        [rowA!.entryId]: "Agree",
        [rowB!.entryId]: "Disagree",
      },
    });
    const flat = encodeValues({
      [rowA!.entryId]: "Agree",
      [rowB!.entryId]: "Disagree",
    });

    expect(nested.toString()).toBe(flat.toString());
  });
});

describe("validateValues", () => {
  const schema: FormSchema = {
    formId: "abc",
    title: "t",
    questions: [
      {
        id: "1",
        entryId: "entry.1",
        title: "Required text",
        type: "short_answer",
        required: true,
      },
      {
        id: "2",
        entryId: "entry.2",
        title: "Optional text",
        type: "short_answer",
        required: false,
      },
      {
        id: "3",
        entryId: "entry.10",
        title: "Required grid",
        type: "grid",
        required: true,
        rows: [
          { entryId: "entry.10", label: "Row A" },
          { entryId: "entry.11", label: "Row B" },
        ],
      },
    ],
    sections: [{ title: "t", questionIds: ["1", "2", "3"] }],
    multiPage: false,
  };

  it("ok:true when all required entries are present and no unknown ids", () => {
    const values: FormValues = {
      "entry.1": "hi",
      "entry.10": "a",
      "entry.11": "b",
    };
    expect(validateValues(values, schema)).toEqual({ ok: true });
  });

  it("flags unknown entry ids", () => {
    const result = validateValues(
      { "entry.999": "x", "entry.1": "hi", "entry.10": "a", "entry.11": "b" },
      schema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => {
          return e.entryId === "entry.999";
        }),
      ).toBe(true);
    }
  });

  it("flags missing required questions (including per-row for grids)", () => {
    const result = validateValues({}, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const ids = result.errors.map((e) => {
        return e.entryId;
      });
      expect(ids).toContain("entry.1");
      expect(ids).toContain("entry.10");
      expect(ids).toContain("entry.11");
    }
  });

  it("encodeValues itself never throws on unknown/missing data", () => {
    expect(() => {
      return encodeValues({ "entry.999": "x" }, schema);
    }).not.toThrow();
  });
});

describe("encodeValues — edge cases", () => {
  it("does not skip a whitespace-only string (pinned: sent verbatim)", () => {
    const params = encodeValues({ "entry.1": "   " });
    expect(params.getAll("entry.1")).toEqual(["   "]);
  });

  it("emits a number 0 (falsy but not empty)", () => {
    expect(encodeValues({ "entry.1": 0 }).getAll("entry.1")).toEqual(["0"]);
  });

  it("emits nothing for {other: ''}", () => {
    const params = encodeValues({ "entry.1": { other: "" } });
    expect(params.has("entry.1")).toBe(false);
    expect(params.has("entry.1.other_option_response")).toBe(false);
  });

  it("drops only the empty Other from a checkbox array", () => {
    const params = encodeValues({ "entry.1": ["A", { other: "" }, "B"] });
    expect(params.getAll("entry.1")).toEqual(["A", "B"]);
    expect(params.has("entry.1.other_option_response")).toBe(false);
  });

  it("sends a whitespace-only Other verbatim", () => {
    const params = encodeValues({ "entry.1": { other: " " } });
    expect(params.getAll("entry.1")).toEqual(["__other_option__"]);
    expect(params.get("entry.1.other_option_response")).toBe(" ");
  });

  it("skips empty strings inside a checkbox array", () => {
    const params = encodeValues({ "entry.1": ["A", "", "B"] });
    expect(params.getAll("entry.1")).toEqual(["A", "B"]);
  });

  it("skips empty strings and empty arrays inside a grid row map", () => {
    const params = encodeValues({
      "entry.1": {
        "entry.10": "",
        "entry.11": [],
        "entry.12": ["X", "", "Y"],
        "entry.13": "Z",
      },
    });
    expect([...params.entries()]).toEqual([
      ["entry.12", "X"],
      ["entry.12", "Y"],
      ["entry.13", "Z"],
    ]);
  });

  it("skips null/undefined members smuggled into arrays", () => {
    const params = encodeValues({
      "entry.1": ["A", null, undefined, "B"] as unknown as string[],
    });
    expect(params.getAll("entry.1")).toEqual(["A", "B"]);
  });

  it("emits nothing for an empty object", () => {
    expect([...encodeValues({ "entry.1": {} }).keys()]).toHaveLength(0);
  });

  it("treats an object with day/month AND hour/minute as a date (date wins over time)", () => {
    const params = encodeValues({
      "entry.1": { month: 1, day: 2, hour: 3, minute: 4 },
    });
    expect([...params.entries()]).toEqual([
      ["entry.1_month", "1"],
      ["entry.1_day", "2"],
      ["entry.1_hour", "03"],
      ["entry.1_minute", "04"],
    ]);
  });

  it("does not zero-pad when only a date's hour is given and skips a missing minute", () => {
    const params = encodeValues({
      "entry.1": { month: 1, day: 2, hour: 7 },
    });
    expect(params.get("entry.1_hour")).toBe("07");
    expect(params.has("entry.1_minute")).toBe(false);
  });

  it("emits only _minute when a date has minute but no hour", () => {
    const params = encodeValues({
      "entry.1": { month: 1, day: 2, minute: 7 },
    });
    expect(params.has("entry.1_hour")).toBe(false);
    expect(params.get("entry.1_minute")).toBe("07");
  });

  it("an object with day but no month is neither date nor time and falls through to the grid-map path (pinned)", () => {
    const params = encodeValues({
      "entry.1": {
        day: 2,
        hour: 3,
        minute: 4,
      },
    });
    expect([...params.entries()]).toEqual([
      ["day", "2"],
      ["hour", "3"],
      ["minute", "4"],
    ]);
  });

  it("an unknown object shape is encoded as a grid map keyed by its own keys", () => {
    const params = encodeValues({ "entry.1": { foo: "bar", baz: ["q"] } });
    expect([...params.entries()]).toEqual([
      ["foo", "bar"],
      ["baz", "q"],
    ]);
  });

  it("ignores the optional schema argument", () => {
    const schema: FormSchema = {
      formId: "x",
      title: "t",
      questions: [],
      sections: [],
      multiPage: false,
    };
    expect(encodeValues({ "entry.1": "a" }, schema).toString()).toBe(
      encodeValues({ "entry.1": "a" }).toString(),
    );
  });
});

describe("encodeValues — live fixture, every question type", () => {
  const schema = parseFormData(loadFixture("all-question-types"));
  const values: FormValues = {};
  const expected: [string, string][] = [];

  for (const q of schema.questions) {
    const first = q.options?.[0]?.value ?? "";
    const second = q.options?.[1]?.value ?? "";
    const other = q.options?.find((o) => {
      return o.isOther;
    });
    switch (q.type) {
      case "short_answer":
      case "paragraph":
        values[q.entryId] = `answer ${q.id}`;
        expected.push([q.entryId, `answer ${q.id}`]);
        break;
      case "multiple_choice":
      case "dropdown":
        if (other) {
          values[q.entryId] = { other: "custom radio" };
          expected.push(
            [q.entryId, "__other_option__"],
            [`${q.entryId}.other_option_response`, "custom radio"],
          );
        } else {
          values[q.entryId] = first;
          expected.push([q.entryId, first]);
        }
        break;
      case "checkboxes":
        if (other) {
          values[q.entryId] = [first, { other: "custom box" }];
          expected.push(
            [q.entryId, first],
            [q.entryId, "__other_option__"],
            [`${q.entryId}.other_option_response`, "custom box"],
          );
        } else {
          values[q.entryId] = [first, second];
          expected.push([q.entryId, first], [q.entryId, second]);
        }
        break;
      case "linear_scale":
        values[q.entryId] = q.scale?.max ?? 5;
        expected.push([q.entryId, String(q.scale?.max ?? 5)]);
        break;
      case "grid": {
        const map: Record<string, string> = {};
        for (const row of q.rows ?? []) {
          map[row.entryId] = first;
          expected.push([row.entryId, first]);
        }
        values[q.entryId] = map;
        break;
      }
      case "checkbox_grid": {
        const map: Record<string, string[]> = {};
        for (const row of q.rows ?? []) {
          map[row.entryId] = [first, second];
          expected.push([row.entryId, first], [row.entryId, second]);
        }
        values[q.entryId] = map;
        break;
      }
      case "date": {
        const withYear = q.date?.includeYear === true;
        const withTime = q.date?.includeTime === true;
        values[q.entryId] = {
          ...(withYear ? { year: 2026 } : {}),
          month: 3,
          day: 7,
          ...(withTime ? { hour: 4, minute: 5 } : {}),
        };
        if (withYear) expected.push([`${q.entryId}_year`, "2026"]);
        expected.push([`${q.entryId}_month`, "3"], [`${q.entryId}_day`, "7"]);
        if (withTime) {
          expected.push(
            [`${q.entryId}_hour`, "04"],
            [`${q.entryId}_minute`, "05"],
          );
        }
        break;
      }
      case "time":
        values[q.entryId] = { hour: 9, minute: 8 };
        expected.push(
          [`${q.entryId}_hour`, "09"],
          [`${q.entryId}_minute`, "08"],
        );
        break;
      case "file_upload":
        break;
    }
  }

  it("covers every question type in the fixture", () => {
    const types = new Set(
      schema.questions.map((q) => {
        return q.type;
      }),
    );
    for (const t of [
      "short_answer",
      "paragraph",
      "multiple_choice",
      "dropdown",
      "checkboxes",
      "linear_scale",
      "grid",
      "checkbox_grid",
      "date",
      "time",
    ]) {
      expect(types.has(t as Question["type"])).toBe(true);
    }
    expect(
      schema.questions.filter((q) => {
        return q.type === "date";
      }).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("encodes every entry key/value pair exactly", () => {
    expect([...encodeValues(values, schema).entries()]).toEqual(expected);
  });

  it("splits date and time into the documented suffixes", () => {
    const params = encodeValues(values, schema);
    const date = schema.questions.find((q) => {
      return q.title === "Date with year and time";
    });
    expect(date).toBeDefined();
    expect(params.get(`${date?.entryId}_year`)).toBe("2026");
    expect(params.get(`${date?.entryId}_hour`)).toBe("04");
    expect(params.has(date?.entryId ?? "")).toBe(false);
  });
});

describe("validateValues — required and issue shapes", () => {
  const q = (over: Partial<Question> & Pick<Question, "entryId">): Question => {
    return {
      id: over.entryId,
      title: `Title ${over.entryId}`,
      type: "short_answer",
      required: true,
      ...over,
    };
  };
  const schemaOf = (...questions: Question[]): FormSchema => {
    return {
      formId: "f",
      title: "t",
      questions,
      sections: [],
      multiPage: false,
    };
  };
  const errorsOf = (
    values: FormValues,
    schema: FormSchema,
  ): ValidationIssue[] => {
    const r = validateValues(values, schema);
    return r.ok ? [] : r.errors;
  };

  it("an unknown entry id produces exactly { entryId, message }", () => {
    expect(
      errorsOf(
        { "entry.9": "x", "entry.1": "a" },
        schemaOf(q({ entryId: "entry.1" })),
      ),
    ).toEqual([
      {
        entryId: "entry.9",
        message: 'Unknown entry id "entry.9" is not present in the form schema',
      },
    ]);
  });

  it("a missing required answer produces exactly { entryId, message }", () => {
    expect(errorsOf({}, schemaOf(q({ entryId: "entry.1" })))).toEqual([
      {
        entryId: "entry.1",
        message:
          'Missing required answer for question "Title entry.1" (entry.1)',
      },
    ]);
  });

  it("reports unknown ids before missing-required ones, and result has only ok/errors", () => {
    const result = validateValues(
      { "entry.9": "x" },
      schemaOf(q({ entryId: "entry.1" })),
    );
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["errors", "ok"]);
    expect(
      errorsOf({ "entry.9": "x" }, schemaOf(q({ entryId: "entry.1" }))).map(
        (e) => {
          return e.entryId;
        },
      ),
    ).toEqual(["entry.9", "entry.1"]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["empty array", []],
    ["empty object", {}],
  ] as [string, FormValues[string]][])(
    "required question with %s is missing",
    (_label, value) => {
      const errs = errorsOf(
        { "entry.1": value },
        schemaOf(q({ entryId: "entry.1" })),
      );
      expect(
        errs.map((e) => {
          return e.entryId;
        }),
      ).toEqual(["entry.1"]);
    },
  );

  it.each([
    ["zero", 0],
    ["whitespace", " "],
    ["non-empty array", ["A"]],
    ["date", { year: 2026, month: 1, day: 1 }],
    ["time", { hour: 0, minute: 0 }],
    ["other with text", { other: "x" }],
  ] as [string, FormValues[string]][])(
    "required question with %s is filled",
    (_label, value) => {
      expect(
        validateValues(
          { "entry.1": value },
          schemaOf(q({ entryId: "entry.1" })),
        ),
      ).toEqual({ ok: true });
    },
  );

  it("required date and time questions are missing when absent and filled when given", () => {
    const schema = schemaOf(
      q({ entryId: "entry.1", type: "date" }),
      q({ entryId: "entry.2", type: "time" }),
    );
    expect(
      errorsOf({}, schema).map((e) => {
        return e.entryId;
      }),
    ).toEqual(["entry.1", "entry.2"]);
    expect(
      validateValues(
        { "entry.1": { month: 1, day: 2 }, "entry.2": { hour: 1, minute: 2 } },
        schema,
      ),
    ).toEqual({ ok: true });
  });

  it("optional questions are never reported missing", () => {
    expect(
      validateValues({}, schemaOf(q({ entryId: "entry.1", required: false }))),
    ).toEqual({ ok: true });
  });

  it("required grid with rows: [] falls back to the question entryId", () => {
    const schema = schemaOf(q({ entryId: "entry.5", type: "grid", rows: [] }));
    expect(
      errorsOf({}, schema).map((e) => {
        return e.entryId;
      }),
    ).toEqual(["entry.5"]);
    expect(validateValues({ "entry.5": "Agree" }, schema)).toEqual({
      ok: true,
    });
  });

  it("required grid checks every row id, with the question title in each message", () => {
    const schema = schemaOf(
      q({
        entryId: "entry.10",
        title: "Grid",
        type: "grid",
        rows: [
          { entryId: "entry.10", label: "A" },
          { entryId: "entry.11", label: "B" },
        ],
      }),
    );
    expect(errorsOf({ "entry.10": "x" }, schema)).toEqual([
      {
        entryId: "entry.11",
        message: 'Missing required answer for question "Grid" (entry.11)',
      },
    ]);
  });

  it("accepts every row id of a grid as known (no unknown-id issue)", () => {
    const schema = schemaOf(
      q({
        entryId: "entry.10",
        required: false,
        type: "grid",
        rows: [
          { entryId: "entry.10", label: "A" },
          { entryId: "entry.11", label: "B" },
        ],
      }),
    );
    expect(
      validateValues({ "entry.10": "x", "entry.11": "y" }, schema),
    ).toEqual({ ok: true });
  });

  it("reports a required question answered with {other: ''} as missing", () => {
    expect(
      errorsOf(
        { "entry.1": { other: "" } },
        schemaOf(q({ entryId: "entry.1" })),
      ),
    ).toEqual([
      {
        entryId: "entry.1",
        message:
          'Missing required answer for question "Title entry.1" (entry.1)',
      },
    ]);
  });

  it("treats a checkbox array of only empty Others as missing, but not one with a real selection", () => {
    const schema = schemaOf(q({ entryId: "entry.1", type: "checkboxes" }));
    expect(errorsOf({ "entry.1": [{ other: "" }] }, schema)).toEqual([
      {
        entryId: "entry.1",
        message:
          'Missing required answer for question "Title entry.1" (entry.1)',
      },
    ]);
    expect(validateValues({ "entry.1": ["A", { other: "" }] }, schema)).toEqual(
      { ok: true },
    );
  });

  it("accepts a required question answered with a non-empty Other", () => {
    expect(
      validateValues(
        { "entry.1": { other: "x" } },
        schemaOf(q({ entryId: "entry.1" })),
      ),
    ).toEqual({ ok: true });
  });

  const nestedGrid = schemaOf(
    q({
      entryId: "entry.10",
      title: "Grid",
      type: "grid",
      rows: [
        { entryId: "entry.10", label: "A" },
        { entryId: "entry.11", label: "B" },
      ],
    }),
  );

  it("accepts a nested row map keyed by the question entryId with every row filled", () => {
    expect(
      validateValues(
        { "entry.10": { "entry.10": "x", "entry.11": "y" } },
        nestedGrid,
      ),
    ).toEqual({ ok: true });
  });

  it("reports the missing required row of a nested row map", () => {
    expect(errorsOf({ "entry.10": { "entry.10": "x" } }, nestedGrid)).toEqual([
      {
        entryId: "entry.11",
        message: 'Missing required answer for question "Grid" (entry.11)',
      },
    ]);
  });

  it("skips a required file_upload question (anonymous uploads are impossible)", () => {
    const schema = parseFormData(loadFixture("file-upload"));
    expect(
      schema.questions.some((question) => {
        return question.type === "file_upload" && question.required;
      }),
    ).toBe(true);
    expect(validateValues({}, schema)).toEqual({ ok: true });
  });

  it("fixture: a complete flat value set validates; an empty one reports every required row", () => {
    const schema = parseFormData(loadFixture("all-question-types"));
    const values: FormValues = {};
    for (const question of schema.questions) {
      const ids = question.rows?.length
        ? question.rows.map((r) => {
            return r.entryId;
          })
        : [question.entryId];
      for (const id of ids) values[id] = "x";
    }
    expect(validateValues(values, schema)).toEqual({ ok: true });

    const expectedMissing = schema.questions
      .filter((question) => {
        return question.required;
      })
      .flatMap((question) => {
        return question.rows?.length
          ? question.rows.map((r) => {
              return r.entryId;
            })
          : [question.entryId];
      });
    expect(
      errorsOf({}, schema).map((e) => {
        return e.entryId;
      }),
    ).toEqual(expectedMissing);
  });
});

describe("validateValues — partially filled date and time", () => {
  const fixture = parseFormData(loadFixture("all-question-types"));
  const pick = (title: string): Question => {
    const found = fixture.questions.find((x) => {
      return x.title === title;
    });
    if (!found) throw new Error(`fixture question missing: ${title}`);
    return found;
  };
  const schemaWith = (question: Question, required: boolean): FormSchema => {
    return { ...fixture, questions: [{ ...question, required }] };
  };
  const missing = (question: Question, value: Partial<DateValue>): string[] => {
    const r = validateValues(
      { [question.entryId]: value as FieldValue },
      schemaWith(question, true),
    );
    return r.ok
      ? []
      : r.errors.map((e) => {
          return e.entryId;
        });
  };

  const cases: {
    title: string;
    full: DateValue | TimeValue;
    partials: [string, Partial<DateValue>][];
  }[] = [
    {
      title: "Date without year",
      full: { month: 3, day: 4 },
      partials: [
        ["no day", { month: 3 }],
        ["no month", { day: 4 }],
      ],
    },
    {
      title: "Date with year",
      full: { year: 2026, month: 3, day: 4 },
      partials: [
        ["no year", { month: 3, day: 4 }],
        ["no day", { year: 2026, month: 3 }],
        ["no month", { year: 2026, day: 4 }],
      ],
    },
    {
      title: "Date with time without year",
      full: { month: 3, day: 4, hour: 5, minute: 6 },
      partials: [
        ["no hour", { month: 3, day: 4, minute: 6 }],
        ["no minute", { month: 3, day: 4, hour: 5 }],
        ["no time", { month: 3, day: 4 }],
        ["no day", { month: 3, hour: 5, minute: 6 }],
      ],
    },
    {
      title: "Date with year and time",
      full: { year: 2026, month: 3, day: 4, hour: 5, minute: 6 },
      partials: [
        ["no year", { month: 3, day: 4, hour: 5, minute: 6 }],
        ["no hour", { year: 2026, month: 3, day: 4, minute: 6 }],
        ["no minute", { year: 2026, month: 3, day: 4, hour: 5 }],
        ["no month", { year: 2026, day: 4, hour: 5, minute: 6 }],
      ],
    },
    {
      title: "Time of day",
      full: { hour: 5, minute: 6 },
      partials: [
        ["no minute", { hour: 5 }],
        ["no hour", { minute: 6 }],
      ],
    },
    {
      title: "Duration",
      full: { hour: 5, minute: 6 },
      partials: [
        ["no minute", { hour: 5 }],
        ["no hour", { minute: 6 }],
      ],
    },
  ];

  for (const c of cases) {
    describe(c.title, () => {
      const question = pick(c.title);
      it("a fully filled required value is ok", () => {
        expect(missing(question, c.full)).toEqual([]);
      });
      it.each(c.partials)("required, %s -> reported missing", (_, value) => {
        expect(missing(question, value)).toEqual([question.entryId]);
      });
      it("not required: a partial value adds no required error", () => {
        const [, partial] = c.partials[0]!;
        expect(
          validateValues(
            { [question.entryId]: partial as FieldValue },
            schemaWith(question, false),
          ),
        ).toEqual({ ok: true });
      });
    });
  }

  it("a zero hour or minute counts as filled", () => {
    expect(missing(pick("Time of day"), { hour: 0, minute: 0 })).toEqual([]);
  });
});

describe("encodeValues and validateValues — duration seconds", () => {
  it.each([
    [5, "05"],
    [45, "45"],
    [0, "00"],
  ])("encodes second %i as _second=%s", (second, padded) => {
    const params = encodeValues({ "entry.1": { hour: 1, minute: 23, second } });
    expect(params.get("entry.1_second")).toBe(padded);
    expect(params.get("entry.1_hour")).toBe("01");
    expect(params.get("entry.1_minute")).toBe("23");
  });

  it("without second there is no _second key", () => {
    const params = encodeValues({ "entry.1": { hour: 1, minute: 23 } });
    expect([...params.keys()]).toEqual(["entry.1_hour", "entry.1_minute"]);
  });

  it("a date value never emits _second", () => {
    const params = encodeValues({
      "entry.1": { month: 1, day: 2, second: 9 },
    });
    expect(params.has("entry.1_second")).toBe(false);
  });

  it("a required duration with second validates; second is not required", () => {
    const schema = parseFormData(loadFixture("all-question-types"));
    const duration = schema.questions.find((x) => {
      return x.title === "Duration";
    });
    if (!duration) throw new Error("fixture question missing: Duration");
    const only = { ...schema, questions: [{ ...duration, required: true }] };
    expect(
      validateValues(
        { [duration.entryId]: { hour: 1, minute: 2, second: 3 } },
        only,
      ),
    ).toEqual({ ok: true });
    expect(
      validateValues({ [duration.entryId]: { hour: 1, minute: 2 } }, only),
    ).toEqual({ ok: true });
  });

  const requiredDuration = () => {
    const schema = parseFormData(loadFixture("all-question-types"));
    const duration = schema.questions.find((x) => {
      return x.title === "Duration";
    });
    if (!duration) throw new Error("fixture question missing: Duration");
    return {
      id: duration.entryId,
      only: { ...schema, questions: [{ ...duration, required: true }] },
    };
  };

  it("hour 1, minute 2, second 75 encodes _second=75 as given (core does not clamp) and validates", () => {
    const { id, only } = requiredDuration();
    const value = { hour: 1, minute: 2, second: 75 };
    expect(encodeValues({ [id]: value }).get(`${id}_second`)).toBe("75");
    expect(validateValues({ [id]: value }, only)).toEqual({ ok: true });
  });

  it("second alone on a required duration is incomplete and reported missing", () => {
    const { id, only } = requiredDuration();
    const result = validateValues(
      { [id]: { second: 30 } as unknown as FieldValue },
      only,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(
        result.errors.map((e) => {
          return e.entryId;
        }),
      ).toEqual([id]);
  });

  it("hour 1, minute 2, second 5 encodes _second=05", () => {
    const params = encodeValues({
      "entry.1": { hour: 1, minute: 2, second: 5 },
    });
    expect(params.get("entry.1_second")).toBe("05");
  });
});

describe("encodeValues — time with an undefined part", () => {
  const partial = (v: { hour?: number; minute?: number }): FieldValue => {
    return v as unknown as FieldValue;
  };

  it("hour undefined encodes only _minute", () => {
    const params = encodeValues({
      "entry.1": partial({ hour: undefined, minute: 5 }),
    });
    expect([...params.entries()]).toEqual([["entry.1_minute", "05"]]);
  });

  it("minute undefined encodes only _hour", () => {
    const params = encodeValues({
      "entry.1": partial({ hour: 7, minute: undefined }),
    });
    expect([...params.entries()]).toEqual([["entry.1_hour", "07"]]);
  });
});
