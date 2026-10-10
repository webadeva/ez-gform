// @vitest-environment jsdom
import { buildSubmitBody, formUrls } from "@ez-gform/core";
import type {
  FormSchema,
  FormValues,
  OtherValue,
  Question,
} from "@ez-gform/types";
import { afterEach, describe, expect, it } from "vitest";
import { loadFixtureSchema } from "../__test-utils__/fixtures.js";
import { generateHtmlForm } from "../generate-html.js";

type Pair = [string, string];

const OTHER = "__other_option__";

const mount = (html: string): HTMLFormElement => {
  document.body.innerHTML = html;
  const form = document.querySelector("form");
  if (!form) {
    throw new Error("generated HTML contains no <form>");
  }
  return form;
};

const byName = (form: HTMLFormElement, name: string): HTMLInputElement[] => {
  return Array.from(
    form.querySelectorAll<HTMLInputElement>("input, textarea, select"),
  ).filter((el) => {
    return el.getAttribute("name") === name;
  });
};

const one = (form: HTMLFormElement, name: string): HTMLInputElement => {
  const [el, ...rest] = byName(form, name);
  if (!el || rest.length > 0) {
    throw new Error(`expected exactly one element named ${name}`);
  }
  return el;
};

const setValue = (form: HTMLFormElement, name: string, value: string): void => {
  one(form, name).value = value;
};

const check = (form: HTMLFormElement, name: string, value: string): void => {
  const el = byName(form, name).find((candidate) => {
    return candidate.value === value;
  });
  if (!el) {
    throw new Error(`no ${name} control with value ${value}`);
  }
  el.checked = true;
};

/**
 * Fills the rendered form the way a user would, driven only by question types
 * and the logical values below (independent of core's encoder).
 */
const fillForm = (
  form: HTMLFormElement,
  questions: Question[],
  values: FormValues,
): void => {
  for (const q of questions) {
    const v = values[q.entryId];
    switch (q.type) {
      case "short_answer":
      case "paragraph":
      case "dropdown":
        if (typeof v === "string") setValue(form, q.entryId, v);
        break;
      case "linear_scale":
        check(form, q.entryId, v as string);
        break;
      case "multiple_choice":
      case "checkboxes": {
        const picks = (Array.isArray(v) ? v : [v]) as (string | OtherValue)[];
        for (const pick of picks) {
          if (typeof pick === "string") {
            check(form, q.entryId, pick);
          } else if (pick && "other" in pick) {
            check(form, q.entryId, OTHER);
            setValue(form, `${q.entryId}.other_option_response`, pick.other);
          }
        }
        break;
      }
      case "grid":
      case "checkbox_grid":
        for (const row of q.rows ?? []) {
          const cols = values[row.entryId] as string | string[];
          for (const col of [cols].flat()) {
            check(form, row.entryId, col);
          }
        }
        break;
      case "date": {
        const d = v as {
          year?: number;
          month: number;
          day: number;
          hour?: number;
          minute?: number;
        };
        if (d.year !== undefined) {
          setValue(form, `${q.entryId}_year`, String(d.year));
        }
        setValue(form, `${q.entryId}_month`, String(d.month));
        setValue(form, `${q.entryId}_day`, String(d.day));
        if (d.hour !== undefined) {
          setValue(form, `${q.entryId}_hour`, String(d.hour));
          setValue(form, `${q.entryId}_minute`, String(d.minute ?? 0));
        }
        break;
      }
      case "time": {
        const t = v as { hour: number; minute: number };
        setValue(form, `${q.entryId}_hour`, String(t.hour));
        setValue(form, `${q.entryId}_minute`, String(t.minute));
        break;
      }
      default:
        break;
    }
  }
};

const sortPairs = (pairs: Pair[]): Pair[] => {
  return [...pairs].sort((a, b) => {
    return a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]);
  });
};

const formDataPairs = (form: HTMLFormElement): Pair[] => {
  const pairs: Pair[] = [];
  for (const [key, value] of new FormData(form)) {
    pairs.push([key, typeof value === "string" ? value : value.name]);
  }
  return sortPairs(normalizeNumbers(pairs));
};

const NUMERIC_KEY = /_(year|month|day|hour|minute)$/;

// Plain number inputs cannot zero-pad, and Google accepts unpadded numbers
// (docs/research/google-forms-internals.md:59), so compare numerically.
const normalizeNumbers = (pairs: Pair[]): Pair[] => {
  return pairs.map(([key, value]): Pair => {
    return NUMERIC_KEY.test(key) ? [key, String(Number(value))] : [key, value];
  });
};

const coreEntries = (
  schema: FormSchema,
  values: FormValues,
  drop: string[] = [],
): Pair[] => {
  const body = buildSubmitBody(schema.formId, values, schema);
  return sortPairs(
    normalizeNumbers(
      [...body].filter(([key]) => {
        return !drop.includes(key);
      }),
    ),
  );
};

// fbzx and partialResponse are per-request tokens, checked separately.
const TOKEN_KEYS = ["fbzx", "partialResponse"];
const withoutTokens = (pairs: Pair[]): Pair[] => {
  return pairs.filter(([key]) => {
    return !TOKEN_KEYS.includes(key);
  });
};

const allTypesValues: FormValues = {
  "entry.2028813558": "Hello & <world> it's",
  "entry.758594018": "42",
  "entry.2040941268": "A paragraph, with = and + signs",
  "entry.1536687708": "Beta",
  "entry.982140529": { other: "Purple" },
  "entry.1985580588": "Two",
  "entry.425514760": ["Apple", "Cherry"],
  "entry.1932922730": ["Cat", { other: "Bird" }],
  "entry.1304572283": ["B", "D"],
  "entry.1044963262": "3",
  "entry.1170777339": "7",
  "entry.1697966657": "Mid",
  "entry.258902491": "High",
  "entry.126163357": ["Morning", "Evening"],
  "entry.2074821697": ["Evening"],
  "entry.1396158763": "4",
  "entry.1384108908": { year: 2026, month: 10, day: 9 },
  "entry.1217411270": { year: 2026, month: 1, day: 2, hour: 7, minute: 5 },
  "entry.309193780": { month: 12, day: 31 },
  "entry.2139776196": { month: 3, day: 4, hour: 23, minute: 0 },
  "entry.1979251707": { hour: 9, minute: 30 },
  "entry.1454464036": { hour: 14, minute: 0 },
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("generateHtmlForm in jsdom: parity with @ez-gform/core", () => {
  it("posts to the same URL core would", () => {
    const schema = loadFixtureSchema("all-question-types");
    const form = mount(generateHtmlForm(schema));
    expect(form.action).toBe(formUrls(schema.formId).formResponse);
    expect(form.method).toBe("post");
  });

  it("builds the same entries as buildSubmitBody for every question type", () => {
    const schema = loadFixtureSchema("all-question-types");
    const form = mount(generateHtmlForm(schema));
    fillForm(form, schema.questions, allTypesValues);

    const expected = coreEntries(schema, allTypesValues, [
      ...TOKEN_KEYS,
      "submit",
    ]);
    expect(withoutTokens(formDataPairs(form))).toEqual(expected);
  });

  it("preserves multi-valued keys and the Other sentinel", () => {
    const schema = loadFixtureSchema("all-question-types");
    const form = mount(generateHtmlForm(schema));
    fillForm(form, schema.questions, allTypesValues);
    const pairs = formDataPairs(form);

    const valuesOf = (key: string): string[] => {
      return pairs
        .filter(([k]) => {
          return k === key;
        })
        .map(([, v]) => {
          return v;
        });
    };
    expect(valuesOf("entry.425514760")).toEqual(["Apple", "Cherry"]);
    expect(valuesOf("entry.1932922730").sort()).toEqual([OTHER, "Cat"].sort());
    expect(valuesOf("entry.1932922730.other_option_response")).toEqual([
      "Bird",
    ]);
    expect(valuesOf("entry.982140529")).toEqual([OTHER]);
    expect(valuesOf("entry.126163357")).toEqual(["Evening", "Morning"]);
    expect(valuesOf("entry.1217411270_hour")).toEqual(["7"]);
  });

  it("round-trips values containing quotes, ampersands and angle brackets", () => {
    const schema: FormSchema = {
      formId: "1FAIpQLSsyntheticformid",
      title: `T "q" & <t> 'x'`,
      sections: [],
      multiPage: false,
      questions: [
        {
          id: "1",
          entryId: "entry.1",
          title: `Pick "one" & <two> 'three'`,
          type: "multiple_choice",
          required: false,
          options: [
            { value: `O'Neil & "Co" <b>`, isOther: false },
            { value: "", isOther: true },
          ],
        },
      ],
    };
    const values: FormValues = { "entry.1": `O'Neil & "Co" <b>` };
    const form = mount(generateHtmlForm(schema));
    fillForm(form, schema.questions, values);
    // An untouched Other text field still posts as an empty string, which core
    // never emits (appendScalar skips ""); Google ignores empty values.
    const nonEmpty = formDataPairs(form).filter(([, v]) => {
      return v !== "";
    });
    expect(nonEmpty).toEqual(coreEntries(schema, values, ["submit"]));
    expect(formDataPairs(form)).toContainEqual([
      "entry.1.other_option_response",
      "",
    ]);
  });

  it("matches core for the file-upload fixture, omitting file questions", () => {
    const schema = loadFixtureSchema("file-upload");
    const form = mount(generateHtmlForm(schema));
    const values: FormValues = { "entry.1038595481": "just text" };
    fillForm(form, schema.questions, values);

    expect(byName(form, "entry.83696370")).toHaveLength(0);
    expect(formDataPairs(form)).toEqual(
      coreEntries(schema, values, ["submit"]),
    );
  });

  it("carries the multi-page fields and matches buildSubmitBody", () => {
    const leaked = "-1234567890123456789";
    const schema = loadFixtureSchema("all-question-types");
    const form = mount(generateHtmlForm({ ...schema, fbzx: leaked }));
    fillForm(form, schema.questions, allTypesValues);

    const html = formDataPairs(form);
    expect(JSON.stringify(html)).not.toContain(leaked);

    const core = coreEntries(schema, allTypesValues);
    const fbzxOf = (pairs: Pair[]): string | undefined => {
      return pairs.find(([k]) => {
        return k === "fbzx";
      })?.[1];
    };
    const partialOf = (pairs: Pair[]): string | undefined => {
      return pairs.find(([k]) => {
        return k === "partialResponse";
      })?.[1];
    };
    expect(fbzxOf(html)).toBe("-1000000000000000000");
    expect(fbzxOf(core)).toMatch(/^-\d{19}$/);
    expect(partialOf(html)).toBe(JSON.stringify([null, null, fbzxOf(html)]));
    expect(partialOf(core)).toBe(JSON.stringify([null, null, fbzxOf(core)]));
    expect(html).toContainEqual(["pageHistory", "0,1,2,3"]);
    // core always appends submit=Submit; the generated button has no name, so
    // FormData omits it (harmless for Google).
    expect(withoutTokens(html)).toEqual(
      withoutTokens(core).filter(([k]) => {
        return k !== "submit";
      }),
    );
  });

  it("sends no value for an untouched optional dropdown, like core", () => {
    const schema: FormSchema = {
      formId: "1FAIpQLSsyntheticformid",
      title: "T",
      sections: [],
      multiPage: false,
      questions: [
        {
          id: "1",
          entryId: "entry.1",
          title: "Pick",
          type: "dropdown",
          required: false,
          options: [
            { value: "One", isOther: false },
            { value: "Two", isOther: false },
          ],
        },
      ],
    };
    const form = mount(generateHtmlForm(schema));
    // The blank choice posts "" (core's appendScalar skips ""; Google ignores it).
    expect(formDataPairs(form)).toEqual([["entry.1", ""]]);
    expect(
      formDataPairs(form).filter(([, v]) => {
        return v !== "";
      }),
    ).toEqual(coreEntries(schema, {}, ["submit"]));
    setValue(form, "entry.1", "Two");
    expect(formDataPairs(form)).toEqual(
      coreEntries(schema, { "entry.1": "Two" }, ["submit"]),
    );
  });

  it("blocks an untouched required dropdown until a real option is picked", () => {
    const schema: FormSchema = {
      formId: "1FAIpQLSsyntheticformid",
      title: "T",
      sections: [],
      multiPage: false,
      questions: [
        {
          id: "1",
          entryId: "entry.1",
          title: "Pick",
          type: "dropdown",
          required: true,
          options: [
            { value: "One", isOther: false },
            { value: "Two", isOther: false },
          ],
        },
      ],
    };
    const form = mount(generateHtmlForm(schema));
    const select = form.querySelector("select");
    if (!select) {
      throw new Error("no select rendered");
    }
    expect(select.checkValidity()).toBe(false);
    expect(select.validity.valueMissing).toBe(true);
    select.value = "Two";
    expect(select.checkValidity()).toBe(true);
    expect(formDataPairs(form)).toEqual(
      coreEntries(schema, { "entry.1": "Two" }, ["submit"]),
    );
  });
});
