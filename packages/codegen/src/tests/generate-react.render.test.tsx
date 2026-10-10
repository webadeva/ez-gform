// @vitest-environment jsdom
import { buildSubmitBody, encodeValues, formUrls } from "@ez-gform/core";
import type { FormValues } from "@ez-gform/types";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GeneratedForm as AllTypesForm,
  fixtureSchema as schema,
} from "virtual:generated-form/all-question-types.tsx";
import { GeneratedForm as FileUploadForm } from "virtual:generated-form/file-upload.tsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../__test-utils__/dom-setup.js";

type Pair = [string, string];

const sortedPairs = (params: URLSearchParams): Pair[] => {
  return [...params.entries()].sort(([ak, av], [bk, bv]) => {
    return ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk);
  });
};

const escapeRegExp = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/** The wrapper div of the question whose label text is exactly `title` (optionally with " *"). */
const block = (title: string): HTMLElement => {
  const label = screen.getByText(new RegExp(`^${escapeRegExp(title)}( \\*)?$`));
  const wrapper = label.closest("div");
  if (!wrapper) throw new Error(`no wrapper for question "${title}"`);
  return wrapper;
};

/** The `<tr>` of a grid row, found by its row label. */
const gridRow = (container: HTMLElement, label: string): HTMLElement => {
  const row = within(container).getByText(label).closest("tr");
  if (!row) throw new Error(`no grid row "${label}"`);
  return row;
};

const mockFetch = () => {
  const fetchMock = vi.fn<typeof fetch>(() => {
    return Promise.resolve(new Response(null, { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => {
  // Network guard: every test must install its own mock via mockFetch().
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      return Promise.reject(new Error("network access is not allowed"));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generated React component, rendered against the real @ez-gform/react", () => {
  it("submits every question type with the same request core would build", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<AllTypesForm />);

    await user.type(
      within(block("Short answer required")).getByRole("textbox"),
      "Hello",
    );
    await user.type(
      within(block("Short answer optional")).getByRole("textbox"),
      "World",
    );
    await user.type(
      within(block("Paragraph question")).getByRole("textbox"),
      "Line one{Enter}Line two",
    );

    await user.click(
      within(block("Radio plain")).getByRole("radio", { name: "Beta" }),
    );

    const radioOther = within(block("Radio with other"));
    await user.click(radioOther.getAllByRole("radio").at(-1)!);
    await user.type(radioOther.getByRole("textbox"), "Purple");

    await user.selectOptions(
      within(block("Dropdown question")).getByRole("combobox"),
      "Two",
    );

    const plainBoxes = within(block("Checkboxes plain"));
    await user.click(plainBoxes.getByRole("checkbox", { name: "Apple" }));
    await user.click(plainBoxes.getByRole("checkbox", { name: "Cherry" }));

    await user.click(
      within(block("Checkboxes with other")).getByRole("checkbox", {
        name: "Cat",
      }),
    );
    const checkboxOther = within(block("Checkboxes with other"));
    await user.click(checkboxOther.getAllByRole("checkbox").at(-1)!);
    await user.type(checkboxOther.getByRole("textbox"), "Bird");

    const validated = within(block("Checkboxes with validation"));
    await user.click(validated.getByRole("checkbox", { name: "A" }));
    await user.click(validated.getByRole("checkbox", { name: "C" }));

    await user.click(
      within(block("Scale with labels")).getByRole("radio", { name: "4" }),
    );
    await user.click(
      within(block("Scale without labels")).getByRole("radio", { name: "7" }),
    );

    const radioGrid = block("Radio grid");
    await user.click(
      within(gridRow(radioGrid, "Row A")).getAllByRole("radio")[1]!,
    );
    await user.click(
      within(gridRow(radioGrid, "Row B")).getAllByRole("radio")[2]!,
    );

    const checkboxGrid = block("Checkbox grid");
    const rowX = within(gridRow(checkboxGrid, "Row X")).getAllByRole(
      "checkbox",
    );
    await user.click(rowX[0]!);
    await user.click(rowX[1]!);
    await user.click(
      within(gridRow(checkboxGrid, "Row Y")).getAllByRole("checkbox")[1]!,
    );

    for (const title of [
      "Date with year",
      "Date with year and time",
      "Date without year",
      "Date with time without year",
    ]) {
      await user.type(
        block(title).querySelector<HTMLInputElement>('input[type="date"]')!,
        "2024-03-15",
      );
    }
    for (const title of [
      "Date with year and time",
      "Date with time without year",
    ]) {
      await user.type(
        block(title).querySelector<HTMLInputElement>('input[type="time"]')!,
        "09:07",
      );
    }
    await user.type(
      block("Time of day").querySelector<HTMLInputElement>(
        'input[type="time"]',
      )!,
      "14:05",
    );
    const duration = within(block("Duration"));
    await user.type(duration.getByLabelText("Hours"), "1");
    await user.type(duration.getByLabelText("Minutes"), "30");
    await user.type(duration.getByLabelText("Seconds"), "45");

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Status: sent")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(formUrls(schema.formId).formResponse);
    expect(init?.method).toBe("POST");
    expect(init?.mode).toBe("no-cors");
    expect(init?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const date = { year: 2024, month: 3, day: 15 };
    const withTime = { ...date, hour: 9, minute: 7 };
    const expected: FormValues = {
      "entry.2028813558": "Hello",
      "entry.758594018": "World",
      "entry.2040941268": "Line one\nLine two",
      "entry.1536687708": "Beta",
      "entry.982140529": { other: "Purple" },
      "entry.1985580588": "Two",
      "entry.425514760": ["Apple", "Cherry"],
      "entry.1932922730": ["Cat", { other: "Bird" }],
      "entry.1304572283": ["A", "C"],
      "entry.1044963262": 4,
      "entry.1170777339": 7,
      "entry.1697966657": "Mid",
      "entry.258902491": "High",
      "entry.126163357": ["Morning", "Evening"],
      "entry.2074821697": ["Evening"],
      "entry.1384108908": date,
      "entry.1217411270": withTime,
      "entry.309193780": { month: 3, day: 15 },
      "entry.2139776196": { month: 3, day: 15, hour: 9, minute: 7 },
      "entry.1979251707": { hour: 14, minute: 5 },
      "entry.1454464036": { hour: 1, minute: 30, second: 45 },
    };

    const sent = new URLSearchParams(
      typeof init?.body === "string" ? init.body : "",
    );
    const reference = buildSubmitBody(schema.formId, expected, schema);

    // The fixture is multi-page with no captured fbzx, so core generates a
    // random one per call: check its shape and consistency, then compare the
    // rest of the body field by field.
    const fbzx = sent.get("fbzx");
    expect(fbzx).toMatch(/^-\d{19}$/);
    expect(sent.get("partialResponse")).toBe(
      JSON.stringify([null, null, fbzx]),
    );
    for (const params of [sent, reference]) {
      params.delete("fbzx");
      params.delete("partialResponse");
    }
    expect(sortedPairs(sent)).toEqual(sortedPairs(reference));

    // Sanity check of the Google rules the comparison relies on.
    const entries = sortedPairs(encodeValues(expected));
    expect(entries).toContainEqual(["entry.982140529", "__other_option__"]);
    expect(entries).toContainEqual([
      "entry.982140529.other_option_response",
      "Purple",
    ]);
    expect(entries).toContainEqual(["entry.1384108908_year", "2024"]);
    expect(entries).toContainEqual(["entry.1979251707_minute", "05"]);
    expect(entries).toContainEqual(["entry.1454464036_second", "45"]);
    expect(sortedPairs(sent)).toContainEqual(["entry.1454464036_second", "45"]);
    expect(
      sortedPairs(sent).filter(([k]) => {
        return k === "entry.425514760";
      }),
    ).toEqual([
      ["entry.425514760", "Apple"],
      ["entry.425514760", "Cherry"],
    ]);
  });

  it("blocks the submit and lists the errors when required fields are empty", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<AllTypesForm />);

    // jsdom enforces native `required` on click-submit, so submit the form
    // directly to exercise the hook's own validation.
    const form = screen
      .getByRole("button", { name: "Submit" })
      .closest("form")!;
    form.noValidate = true;
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Status: error")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Missing required answer for question "Short answer required"/,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the file-upload note and submits the other answers; validation skips the required upload", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<FileUploadForm />);

    expect(screen.getByText(/is a file upload question/)).toBeInTheDocument();
    await user.type(within(block("Name")).getByRole("textbox"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Status: sent")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = new URLSearchParams(
      typeof init?.body === "string" ? init.body : "",
    );
    expect(body.get("entry.1038595481")).toBe("Ada");
    expect(body.has("entry.83696370")).toBe(false);
  });
});
