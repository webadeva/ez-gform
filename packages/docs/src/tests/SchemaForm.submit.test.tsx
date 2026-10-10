import type { FormSchema, FormValues, Question } from "@ez-gform/core";
import {
  buildPrefillUrl,
  buildSubmitBody,
  parseFormData,
} from "@ez-gform/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import allQuestionTypes from "../app/playground/all-question-types.fixture.json";
import { SchemaForm } from "../components/SchemaForm";

const FORM_ID = "1FAIpQLtestformidtestformid1234567";
const FORM_RESPONSE_URL = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;

const simpleSchema = (overrides: Partial<FormSchema> = {}): FormSchema => {
  return {
    formId: FORM_ID,
    title: "Simple form",
    questions: [
      {
        id: "q1",
        entryId: "entry.1",
        title: "Your name",
        type: "short_answer",
        required: true,
      },
      {
        id: "q2",
        entryId: "entry.2",
        title: "Your city",
        type: "short_answer",
        required: true,
      },
    ],
    sections: [],
    multiPage: false,
    ...overrides,
  };
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const submitButton = () => {
  return screen.getByRole("button", { name: /submit to google form|sending/i });
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SchemaForm submit: validation", () => {
  it("lists a validation error per missing required question and sends nothing", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={simpleSchema()} />);

    await user.click(submitButton());

    const items = await screen.findAllByRole("listitem");
    expect(
      items.map((li) => {
        return li.textContent;
      }),
    ).toEqual([
      'Missing required answer for question "Your name" (entry.1)',
      'Missing required answer for question "Your city" (entry.2)',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("error").className).toBe("status-badge error");
  });

  it("clears the error list once the missing answers are filled and submit succeeds", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={simpleSchema()} />);

    await user.click(submitButton());
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);

    await user.type(screen.getByLabelText(/Your name/), "Ada");
    await user.type(screen.getByLabelText(/Your city/), "London");
    await user.click(submitButton());

    expect(await screen.findByText("sent")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("SchemaForm submit: status", () => {
  it("shows no status badge before submitting", () => {
    render(<SchemaForm schema={simpleSchema()} />);
    expect(document.querySelector(".status-badge")).toBeNull();
  });

  it("shows 'Sending…' and disables the button while fetch is pending, then 'sent'", async () => {
    const gate = deferred<{ ok: boolean; status: number }>();
    fetchMock.mockReturnValue(gate.promise);
    const user = userEvent.setup();
    render(<SchemaForm schema={simpleSchema()} />);

    await user.type(screen.getByLabelText(/Your name/), "Ada");
    await user.type(screen.getByLabelText(/Your city/), "London");
    await user.click(submitButton());

    const pendingButton = await screen.findByRole("button", {
      name: "Sending…",
    });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("submitting").className).toBe(
      "status-badge submitting",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ ok: true, status: 200 });
      await gate.promise;
    });

    const doneButton = await screen.findByRole("button", {
      name: "Submit to Google Form",
    });
    expect((doneButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("sent").className).toBe("status-badge sent");
  });

  it("shows the 'error' badge when the network call rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<SchemaForm schema={simpleSchema()} />);

    await user.type(screen.getByLabelText(/Your name/), "Ada");
    await user.type(screen.getByLabelText(/Your city/), "London");
    await user.click(submitButton());

    expect((await screen.findByText("error")).className).toBe(
      "status-badge error",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A network failure is not a validation failure: no error list.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("SchemaForm submit: prefill link", () => {
  it("reflects the entered values and matches buildPrefillUrl", async () => {
    const user = userEvent.setup();
    const schema = simpleSchema();
    render(<SchemaForm schema={schema} />);

    expect(
      screen.getByRole("link", { name: /prefill url/i }).getAttribute("href"),
    ).toBe(buildPrefillUrl(FORM_ID, {}, schema));

    await user.type(screen.getByLabelText(/Your name/), "Ada L");
    await user.type(screen.getByLabelText(/Your city/), "Paris");

    const link = screen.getByRole("link", { name: /prefill url/i });
    const expected = buildPrefillUrl(
      FORM_ID,
      { "entry.1": "Ada L", "entry.2": "Paris" },
      schema,
    );
    expect(link.getAttribute("href")).toBe(expected);
    expect(link.getAttribute("target")).toBe("_blank");

    const params = new URL(link.getAttribute("href") ?? "").searchParams;
    expect(params.get("usp")).toBe("pp_url");
    expect(params.get("entry.1")).toBe("Ada L");
    expect(params.get("entry.2")).toBe("Paris");
  });
});

describe("SchemaForm submit: accessible name", () => {
  it("uses the schema title as the form's aria-label", () => {
    render(<SchemaForm schema={simpleSchema({ title: "Survey 2026" })} />);
    expect(screen.getByRole("form", { name: "Survey 2026" })).toBeDefined();
  });

  it("falls back to 'Google Form' when the schema has no title", () => {
    render(<SchemaForm schema={simpleSchema({ title: "" })} />);
    expect(screen.getByRole("form", { name: "Google Form" })).toBeDefined();
  });
});

describe("SchemaForm submit: full fixture end-to-end", () => {
  it("fills every question through the UI and posts exactly what core encodes", async () => {
    const user = userEvent.setup();
    // The fixture has no captured fbzx; pin one so the multi-page body is deterministic.
    const schema: FormSchema = {
      ...parseFormData(allQuestionTypes),
      fbzx: "-1234567890123456789",
    };
    render(<SchemaForm schema={schema} />);

    const field = (title: string) => {
      const question = schema.questions.find((q: Question) => {
        return q.title === title;
      });
      expect(question).toBeDefined();
      const label = screen.getByText(
        `${title}${question?.required ? " *" : ""}`,
        { selector: "label" },
      );
      const container = label.closest("div.field");
      expect(container).not.toBeNull();
      return within(container as HTMLElement);
    };

    // text, paragraph (expected keys below follow UI interaction order, which is the encoded order)
    await user.type(
      field("Short answer required").getByRole("textbox"),
      "Hello & goodbye",
    );
    await user.type(
      field("Short answer optional").getByRole("textbox"),
      "optional",
    );
    await user.type(
      field("Paragraph question").getByRole("textbox"),
      "line1{Enter}line2",
    );

    // option labels are siblings of the inputs (not associated), so pick inputs by option position
    // radio, radio with Other
    await user.click(field("Radio plain").getAllByRole("radio")[1]!);
    const radioOther = field("Radio with other");
    await user.click(radioOther.getAllByRole("radio")[2]!);
    await user.type(radioOther.getByRole("textbox"), "Purple");

    // dropdown
    await user.selectOptions(
      field("Dropdown question").getByRole("combobox"),
      "Two",
    );

    // checkboxes: plain, plain + Other, validated
    const plain = field("Checkboxes plain");
    await user.click(plain.getAllByRole("checkbox")[0]!);
    await user.click(plain.getAllByRole("checkbox")[2]!);

    const withOther = field("Checkboxes with other");
    await user.click(withOther.getAllByRole("checkbox")[2]!);
    await user.type(withOther.getByRole("textbox"), "Bird");
    await user.click(withOther.getAllByRole("checkbox")[0]!);

    const validated = field("Checkboxes with validation");
    await user.click(validated.getAllByRole("checkbox")[0]!);
    await user.click(validated.getAllByRole("checkbox")[1]!);

    // scales
    await user.click(
      field("Scale with labels").getByRole("radio", { name: "4" }),
    );
    await user.click(
      field("Scale without labels").getByRole("radio", { name: "2" }),
    );
    await user.click(
      field("Rating question").getByRole("radio", { name: "5" }),
    );

    // grid: one radio per column in each row
    const grid = field("Radio grid");
    const radioAt = (rowLabel: string, column: number) => {
      const row = grid.getByText(rowLabel).closest("tr") as HTMLElement;
      return within(row).getAllByRole("radio")[column]!;
    };
    await user.click(radioAt("Row A", 0)); // Low
    await user.click(radioAt("Row B", 2)); // High

    // checkbox grid
    const checkboxGrid = field("Checkbox grid");
    const checkAt = (rowLabel: string, column: number) => {
      const row = checkboxGrid.getByText(rowLabel).closest("tr") as HTMLElement;
      return within(row).getAllByRole("checkbox")[column]!;
    };
    await user.click(checkAt("Row X", 0)); // Morning
    await user.click(checkAt("Row Y", 0)); // Morning
    await user.click(checkAt("Row Y", 1)); // Evening

    // dates
    const typeParts = async (title: string, parts: Record<string, number>) => {
      const scope = field(title);
      for (const [label, value] of Object.entries(parts)) {
        const input = scope.getByLabelText(label);
        await user.type(input, String(value));
      }
    };
    await typeParts("Date with year", { Year: 2025, Month: 3, Day: 7 });
    await typeParts("Date with year and time", {
      Year: 2024,
      Month: 11,
      Day: 2,
      Hour: 9,
      Minute: 5,
    });
    await typeParts("Date without year", { Month: 12, Day: 25 });
    await typeParts("Date with time without year", {
      Month: 1,
      Day: 31,
      Hour: 23,
      Minute: 59,
    });

    // times
    await typeParts("Time of day", { Hour: 14, Minute: 30 });
    await typeParts("Duration", { Hours: 1, Minutes: 2, Seconds: 45 });

    const expected: FormValues = {
      "entry.2028813558": "Hello & goodbye",
      "entry.758594018": "optional",
      "entry.2040941268": "line1\nline2",
      "entry.1536687708": "Beta",
      "entry.982140529": { other: "Purple" },
      "entry.1985580588": "Two",
      "entry.425514760": ["Apple", "Cherry"],
      "entry.1932922730": [{ other: "Bird" }, "Cat"],
      "entry.1304572283": ["A", "B"],
      "entry.1044963262": 4,
      "entry.1170777339": 2,
      "entry.1396158763": 5,
      "entry.1697966657": "Low",
      "entry.258902491": "High",
      "entry.126163357": ["Morning"],
      "entry.2074821697": ["Morning", "Evening"],
      "entry.1384108908": { year: 2025, month: 3, day: 7 },
      "entry.1217411270": { year: 2024, month: 11, day: 2, hour: 9, minute: 5 },
      "entry.309193780": { month: 12, day: 25 },
      "entry.2139776196": { month: 1, day: 31, hour: 23, minute: 59 },
      "entry.1979251707": { hour: 14, minute: 30 },
      "entry.1454464036": { hour: 1, minute: 2, second: 45 },
    };

    await user.click(submitButton());

    expect(await screen.findByText("sent")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FORM_RESPONSE_URL.replace(FORM_ID, schema.formId));
    expect(init.method).toBe("POST");
    expect(init.mode).toBe("no-cors");

    const body = init.body as string;
    expect(body).toBe(
      buildSubmitBody(schema.formId, expected, schema).toString(),
    );

    // Literal substrings, so the assertion is not just core compared with itself.
    expect(body).toContain("entry.1384108908_year=2025");
    expect(body).toContain("entry.1217411270_hour=09");
    expect(body).toContain("entry.1217411270_minute=05");
    expect(body).not.toContain("entry.309193780_year");
    expect(body).toContain("entry.982140529=__other_option__");
    expect(body).toContain("entry.982140529.other_option_response=Purple");
    expect(body).toContain("entry.1932922730.other_option_response=Bird");
    expect(body).toContain("entry.425514760=Apple&entry.425514760=Cherry");
    expect(body).toContain("pageHistory=0%2C1%2C2%2C3");
    expect(body).toContain("fbzx=-1234567890123456789");
    expect(body).toContain("submit=Submit");
  }, 60_000);
});
