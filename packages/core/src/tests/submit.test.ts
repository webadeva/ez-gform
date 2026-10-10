import type { FormSchema } from "@ez-gform/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFormData } from "../parse.js";
import { buildPrefillUrl, buildSubmitBody, submitForm } from "../submit.js";

const ID = "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw";
const PREFIX = `https://docs.google.com/forms/d/e/${ID}/viewform?usp=pp_url`;

const fixturesDir = fileURLToPath(new URL("../__fixtures__/", import.meta.url));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildPrefillUrl", () => {
  it("builds a viewform URL with usp=pp_url and encoded entries", () => {
    const url = buildPrefillUrl(ID, { "entry.1": "hello" });
    expect(
      url.startsWith(`https://docs.google.com/forms/d/e/${ID}/viewform?`),
    ).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("usp")).toBe("pp_url");
    expect(parsed.searchParams.get("entry.1")).toBe("hello");
  });

  it("encodes an Other value as the sentinel plus other_option_response", () => {
    expect(buildPrefillUrl(ID, { "entry.1": { other: "a b&c" } })).toBe(
      `${PREFIX}&entry.1=__other_option__&entry.1.other_option_response=a+b%26c`,
    );
  });

  it("encodes a date value as _year/_month/_day", () => {
    expect(
      buildPrefillUrl(ID, { "entry.2": { year: 2024, month: 3, day: 9 } }),
    ).toBe(`${PREFIX}&entry.2_year=2024&entry.2_month=3&entry.2_day=9`);
  });

  it("encodes a time value as zero-padded _hour/_minute", () => {
    expect(buildPrefillUrl(ID, { "entry.3": { hour: 7, minute: 5 } })).toBe(
      `${PREFIX}&entry.3_hour=07&entry.3_minute=05`,
    );
  });

  it("repeats entry.N for a checkbox array", () => {
    expect(buildPrefillUrl(ID, { "entry.4": ["A B", "C"] })).toBe(
      `${PREFIX}&entry.4=A+B&entry.4=C`,
    );
  });

  it("encodes grid row maps (single and multi-select rows)", () => {
    expect(
      buildPrefillUrl(ID, {
        "entry.5": { "entry.6": "Col 1", "entry.7": ["x", "y"] },
      }),
    ).toBe(`${PREFIX}&entry.6=Col+1&entry.7=x&entry.7=y`);
  });

  it("throws for an invalid formId", () => {
    expect(() => {
      buildPrefillUrl("not a form id", {});
    }).toThrow(/not a recognizable Google Form id/);
  });
});

describe("buildSubmitBody", () => {
  it("always includes submit=Submit", () => {
    const body = buildSubmitBody(ID, { "entry.1": "hi" });
    expect(body.get("submit")).toBe("Submit");
  });

  it("does not add multi-page fields for a single-page schema", () => {
    const schema: FormSchema = {
      formId: ID,
      title: "t",
      questions: [],
      sections: [{ title: "t", questionIds: [] }],
      multiPage: false,
    };
    const body = buildSubmitBody(ID, {}, schema);
    expect(body.has("fbzx")).toBe(false);
    expect(body.has("pageHistory")).toBe(false);
  });

  it("adds fbzx/pageHistory/partialResponse for a multi-page schema", () => {
    const schema: FormSchema = {
      formId: ID,
      title: "t",
      questions: [],
      sections: [
        { title: "p0", questionIds: [] },
        { title: "p1", questionIds: [] },
        { title: "p2", questionIds: [] },
      ],
      multiPage: true,
      fbzx: "-1234567890123456789",
    };
    const body = buildSubmitBody(ID, {}, schema);
    expect(body.get("fbzx")).toBe("-1234567890123456789");
    expect(body.get("pageHistory")).toBe("0,1,2");
    expect(body.get("partialResponse")).toBe(
      JSON.stringify([null, null, "-1234567890123456789"]),
    );
  });

  it("falls back to a single page in pageHistory when sections is empty", () => {
    const schema: FormSchema = {
      formId: ID,
      title: "t",
      questions: [],
      sections: [],
      multiPage: true,
      fbzx: "-42",
    };
    const body = buildSubmitBody(ID, { "entry.1": "x" }, schema);
    expect(body.get("pageHistory")).toBe("0");
    expect(body.get("fbzx")).toBe("-42");
    expect(body.get("partialResponse")).toBe('[null,null,"-42"]');
    expect(body.toString()).toBe(
      "entry.1=x&fbzx=-42&pageHistory=0&partialResponse=%5Bnull%2Cnull%2C%22-42%22%5D&submit=Submit",
    );
  });

  it("throws for an invalid formId", () => {
    expect(() => {
      buildSubmitBody("nope", {});
    }).toThrow(/not a recognizable Google Form id/);
  });

  it("generates a random fbzx if the schema doesn't carry one", () => {
    const schema: FormSchema = {
      formId: ID,
      title: "t",
      questions: [],
      sections: [
        { title: "p0", questionIds: [] },
        { title: "p1", questionIds: [] },
      ],
      multiPage: true,
    };
    const body = buildSubmitBody(ID, {}, schema);
    expect(body.get("fbzx")).toMatch(/^-\d{19}$/);
  });
});

describe("submitForm", () => {
  it("returns {status: 'sent'} on a successful no-cors fetch", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue({ type: "opaque", status: 0, ok: false });
    const result = await submitForm(
      ID,
      { "entry.1": "hi" },
      { fetch: fakeFetch as unknown as typeof fetch },
    );
    expect(result).toEqual({ status: "sent" });
    expect(fakeFetch).toHaveBeenCalledWith(
      `https://docs.google.com/forms/d/e/${ID}/formResponse`,
      expect.objectContaining({ method: "POST", mode: "no-cors" }),
    );
  });

  it("returns {status: 'error'} when fetch rejects", async () => {
    const err = new Error("network down");
    const fakeFetch = vi.fn().mockRejectedValue(err);
    const result = await submitForm(
      ID,
      { "entry.1": "hi" },
      { fetch: fakeFetch as unknown as typeof fetch },
    );
    expect(result).toEqual({ status: "error", error: err });
  });

  it("returns {status: 'ok', httpStatus} for a 2xx response in cors mode", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await submitForm(
      ID,
      { "entry.1": "hi" },
      { fetch: fakeFetch as unknown as typeof fetch, mode: "cors" },
    );
    expect(result).toEqual({ status: "ok", httpStatus: 200 });
  });

  it("returns {status: 'error', httpStatus} for a non-2xx response in cors mode", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    const result = await submitForm(
      ID,
      { "entry.1": "hi" },
      { fetch: fakeFetch as unknown as typeof fetch, mode: "cors" },
    );
    expect(result.status).toBe("error");
    expect((result as { httpStatus?: number }).httpStatus).toBe(400);
  });

  it("sends exact Content-Type header and body string", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({});
    await submitForm(
      ID,
      { "entry.1": "a b", "entry.2": ["x", "y"] },
      { fetch: fakeFetch as unknown as typeof fetch },
    );
    const init = fakeFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBe("entry.1=a+b&entry.2=x&entry.2=y&submit=Submit");
    expect(init.method).toBe("POST");
    expect(init.mode).toBe("no-cors");
  });

  it("passes opts.signal through to fetch", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({});
    const controller = new AbortController();
    await submitForm(
      ID,
      {},
      {
        fetch: fakeFetch as unknown as typeof fetch,
        signal: controller.signal,
      },
    );
    const init = fakeFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("returns {status: 'error'} carrying the AbortError when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fakeFetch = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    const result = await submitForm(
      ID,
      {},
      {
        fetch: fakeFetch as unknown as typeof fetch,
        signal: controller.signal,
      },
    );
    expect(result.status).toBe("error");
    expect((result as { error: Error }).error.name).toBe("AbortError");
  });

  it("uses the global fetch when opts.fetch is omitted", async () => {
    const globalFetch = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", globalFetch);
    const result = await submitForm(ID, { "entry.1": "hi" });
    expect(result).toEqual({ status: "sent" });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch.mock.calls[0]?.[0]).toBe(
      `https://docs.google.com/forms/d/e/${ID}/formResponse`,
    );
  });

  it("includes an Error mentioning the HTTP status for non-2xx in cors mode", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await submitForm(
      ID,
      {},
      { fetch: fakeFetch as unknown as typeof fetch, mode: "cors" },
    );
    expect(result).toEqual({
      status: "error",
      error: new Error("formResponse returned HTTP 500"),
      httpStatus: 500,
    });
  });

  it("resolves to an error result for an invalid formId and never calls fetch", async () => {
    const fakeFetch = vi.fn();
    const result = await submitForm(
      "bad",
      {},
      {
        fetch: fakeFetch as unknown as typeof fetch,
      },
    );
    expect(result.status).toBe("error");
    expect((result as { error: Error }).error.message).toMatch(
      /not a recognizable Google Form id/,
    );
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("encodes file_upload question values from the live fixture", async () => {
    const raw: unknown = JSON.parse(
      readFileSync(`${fixturesDir}file-upload.json`, "utf8"),
    );
    const schema = parseFormData(raw);
    const upload = schema.questions.find((q) => {
      return q.type === "file_upload";
    });
    expect(upload).toBeDefined();
    const fakeFetch = vi.fn().mockResolvedValue({});
    const result = await submitForm(
      ID,
      { [upload?.entryId ?? "missing"]: "drive-file-id" },
      { schema, fetch: fakeFetch as unknown as typeof fetch },
    );
    expect(result).toEqual({ status: "sent" });
    const init = fakeFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(`${upload?.entryId}=drive-file-id&submit=Submit`);
  });
});
