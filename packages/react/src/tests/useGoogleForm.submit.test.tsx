import type { FormSchema, FormValues } from "@ez-gform/core";
import { buildSubmitBody, parseFormData } from "@ez-gform/core";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGoogleForm } from "../useGoogleForm.js";

const FORM_ID = "1FAIpQLtestformidtestformid1234567";
const FORM_RESPONSE_URL = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;

const loadDemoSchema = (): FormSchema => {
  const fixturePath = path.resolve(
    import.meta.dirname,
    "../../../core/src/__fixtures__/all-question-types.json",
  );
  const data = JSON.parse(readFileSync(fixturePath, "utf8"));
  // The fixture has no captured fbzx; pin one so the multi-page body is deterministic.
  return { ...parseFormData(data), fbzx: "-1234567890123456789" };
};

const singlePageSchema: FormSchema = {
  formId: FORM_ID,
  title: "Test",
  questions: [
    {
      id: "q1",
      entryId: "entry.1",
      title: "Required question",
      type: "short_answer",
      required: true,
    },
  ],
  sections: [],
  multiPage: false,
};

const okResponse = { ok: true, status: 200 };

const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0): string => {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return init.body as string;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGoogleForm submit: in-flight status", () => {
  it("is 'submitting' with isSubmitting true while fetch is pending, then settles", async () => {
    const gate = deferred();
    const fetchMock = vi.fn().mockReturnValue(gate.promise);
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, fetch: fetchMock });
    });

    expect(result.current.isSubmitting).toBe(false);

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.submit();
    });

    expect(result.current.status).toBe("submitting");
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      gate.resolve(okResponse);
      await pending;
    });

    expect(result.current.status).toBe("sent");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("never exposes a stale 'validating' status: validation is synchronous and batched into the next dispatch", async () => {
    const gate = deferred();
    const fetchMock = vi.fn().mockReturnValue(gate.promise);
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema: singlePageSchema,
        initialValues: { "entry.1": "x" },
        fetch: fetchMock,
      });
    });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.submit();
    });

    expect(result.current.status).toBe("submitting");
    expect(result.current.errors).toEqual([]);

    await act(async () => {
      gate.resolve(okResponse);
      await pending;
    });
  });

  it("ignores a concurrent second submit and clears the in-flight guard so a later submit fetches again", async () => {
    const gate = deferred();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, fetch: fetchMock });
    });

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.submit();
      second = result.current.submit();
    });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve(okResponse);
      await first;
    });

    await act(async () => {
      await result.current.submit();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useGoogleForm submit: cors errors", () => {
  it("non-2xx in cors mode yields status 'error' with httpStatus, calls onError, not onSent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const onSent = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        mode: "cors",
        fetch: fetchMock,
        onSent,
        onError,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.result).toMatchObject({
      status: "error",
      httpStatus: 500,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      status: "error",
      httpStatus: 500,
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("cors 2xx reports 'ok' with httpStatus", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, mode: "cors", fetch: fetchMock });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.result).toEqual({ status: "ok", httpStatus: 204 });
  });
});

describe("useGoogleForm submit: validation", () => {
  it("validates with the schema and then performs the network call when values pass", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const onSent = vi.fn();
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema: singlePageSchema,
        initialValues: { "entry.1": "answer" },
        fetch: fetchMock,
        onSent,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("sent");
    expect(result.current.errors).toEqual([]);
    expect(onSent).toHaveBeenCalledWith({ status: "sent" });
  });

  it("validation failure sends nothing, sets errors, and does not resetOnSent", async () => {
    const fetchMock = vi.fn();
    const onSent = vi.fn();
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema: singlePageSchema,
        initialValues: {},
        fetch: fetchMock,
        resetOnSent: true,
        onSent,
      });
    });

    act(() => {
      result.current.setValue("entry.1", "");
      result.current.setValue("entry.99", "kept");
    });

    let submitResult;
    await act(async () => {
      submitResult = await result.current.submit();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(submitResult).toMatchObject({ status: "error" });
    expect(result.current.errors.length).toBeGreaterThan(0);
    expect(result.current.values["entry.99"]).toBe("kept");
  });

  it("validate: false sends values that would fail validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema: singlePageSchema,
        validate: false,
        initialValues: { "entry.unknown": "stray" },
        fetch: fetchMock,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchMock)).toContain("entry.unknown=stray");
    expect(result.current.status).toBe("sent");
  });
});

describe("useGoogleForm submit: events and resetOnSent", () => {
  it("calls event.preventDefault when submit receives an event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const preventDefault = vi.fn();
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, fetch: fetchMock });
    });

    await act(async () => {
      await result.current.submit({ preventDefault });
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("resetOnSent resets values on success but not on error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        initialValues: { "entry.1": "start" },
        fetch: fetchMock,
        resetOnSent: true,
      });
    });

    act(() => {
      result.current.setValue("entry.1", "changed");
    });

    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.values).toEqual({ "entry.1": "changed" });

    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.values).toEqual({ "entry.1": "start" });
  });
});

describe("useGoogleForm submit: unmount during submit", () => {
  it("does not dispatch or warn when the component unmounts before fetch settles", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return undefined;
    });
    const gate = deferred();
    const fetchMock = vi.fn().mockReturnValue(gate.promise);
    const onSent = vi.fn();
    const { result, unmount } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, fetch: fetchMock, onSent });
    });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.submit();
    });
    unmount();

    await act(async () => {
      gate.resolve(okResponse);
      await pending;
    });

    expect(await pending).toEqual({ status: "sent" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  // TODO(bug): resetOnSent does not dispatch a reset after the component has unmounted (useGoogleForm.ts:235-237 is not guarded by mountedRef).
});

describe("useGoogleForm submit: values read at submit time", () => {
  it("sends the value set in an earlier act", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, fetch: fetchMock });
    });

    act(() => {
      result.current.setValue("entry.1", "fresh");
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(sentBody(fetchMock)).toContain("entry.1=fresh");
  });

  // TODO(bug): submit() called in the same act as setValue sends the just-set value rather than the stale pre-update value (stateRef is only synced in an effect, useGoogleForm.ts:160-162,201).
});

describe("useGoogleForm submit: request shape and body", () => {
  it("POSTs urlencoded to formResponse with no-cors by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        initialValues: { "entry.1": "hello world" },
        fetch: fetchMock,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FORM_RESPONSE_URL);
    expect(init.method).toBe("POST");
    expect(init.mode).toBe("no-cors");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBe("entry.1=hello+world&submit=Submit");
  });

  it("passes mode: cors through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({ formId: FORM_ID, mode: "cors", fetch: fetchMock });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).mode).toBe("cors");
  });

  it("encodes every question type of the multi-page fixture exactly as core does", async () => {
    const schema = loadDemoSchema();
    const values: FormValues = {
      "entry.2028813558": "Hello & goodbye",
      "entry.758594018": "optional",
      "entry.2040941268": "line1\nline2",
      "entry.1536687708": "Beta",
      "entry.982140529": { other: "Purple" },
      "entry.1985580588": "Two",
      "entry.425514760": ["Apple", "Cherry"],
      "entry.1932922730": ["Cat", { other: "Bird" }],
      "entry.1304572283": ["A", "B"],
      "entry.1044963262": 4,
      "entry.1170777339": 2,
      "entry.1697966657": "Low",
      "entry.258902491": "High",
      "entry.126163357": ["Morning"],
      "entry.2074821697": ["Morning", "Evening"],
      "entry.1396158763": 5,
      "entry.1384108908": { year: 2025, month: 3, day: 7 },
      "entry.1217411270": { year: 2024, month: 11, day: 2, hour: 9, minute: 5 },
      "entry.309193780": { month: 12, day: 25 },
      "entry.2139776196": { month: 1, day: 31, hour: 23, minute: 59 },
      "entry.1979251707": { hour: 14, minute: 30 },
      "entry.1454464036": { hour: 1, minute: 2 },
    };
    const fetchMock = vi.fn().mockResolvedValue(okResponse);

    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema,
        initialValues: values,
        fetch: fetchMock,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBody(fetchMock);
    expect(body).toBe(buildSubmitBody(FORM_ID, values, schema).toString());

    const params = new URLSearchParams(body);
    expect(params.get("entry.2028813558")).toBe("Hello & goodbye");
    expect(params.get("entry.1384108908_year")).toBe("2025");
    expect(params.get("entry.1384108908_month")).toBe("3");
    expect(params.get("entry.1384108908_day")).toBe("7");
    expect(params.get("entry.1217411270_hour")).toBe("09");
    expect(params.get("entry.1217411270_minute")).toBe("05");
    expect(params.has("entry.309193780_year")).toBe(false);
    expect(params.get("entry.1979251707_hour")).toBe("14");
    expect(params.get("entry.1979251707_minute")).toBe("30");
    expect(params.get("entry.982140529")).toBe("__other_option__");
    expect(params.get("entry.982140529.other_option_response")).toBe("Purple");
    expect(params.getAll("entry.425514760")).toEqual(["Apple", "Cherry"]);
    expect(params.getAll("entry.1932922730")).toEqual([
      "Cat",
      "__other_option__",
    ]);
    expect(params.get("entry.1932922730.other_option_response")).toBe("Bird");
    expect(params.get("entry.258902491")).toBe("High");
    expect(params.getAll("entry.2074821697")).toEqual(["Morning", "Evening"]);
    expect(params.get("fbzx")).toBe("-1234567890123456789");
    expect(params.get("pageHistory")).toBe("0,1,2,3");
    expect(params.get("partialResponse")).toBe(
      JSON.stringify([null, null, "-1234567890123456789"]),
    );
    expect(params.get("submit")).toBe("Submit");
  });

  it("builds the exact body for a single-page schema without multi-page fields", async () => {
    const values: FormValues = { "entry.1": "answer" };
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => {
      return useGoogleForm({
        formId: FORM_ID,
        schema: singlePageSchema,
        initialValues: values,
        fetch: fetchMock,
      });
    });

    await act(async () => {
      await result.current.submit();
    });

    const body = sentBody(fetchMock);
    expect(body).toBe(
      buildSubmitBody(FORM_ID, values, singlePageSchema).toString(),
    );
    expect(body).toBe("entry.1=answer&submit=Submit");
  });
});
