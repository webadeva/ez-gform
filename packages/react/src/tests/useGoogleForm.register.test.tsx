import type { FormSchema } from "@ez-gform/core";
import { parseFormData } from "@ez-gform/core";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { UseGoogleFormOptions } from "../useGoogleForm.js";
import { useGoogleForm } from "../useGoogleForm.js";

const FORM_ID = "1FAIpQLtestformidtestformid1234567";

const loadDemoSchema = (): FormSchema => {
  const fixturePath = path.resolve(
    import.meta.dirname,
    "../../../core/src/__fixtures__/all-question-types.json",
  );
  const data = JSON.parse(readFileSync(fixturePath, "utf8"));
  return parseFormData(data);
};

const setup = (options: Partial<UseGoogleFormOptions> = {}) => {
  return renderHook(
    (props: Partial<UseGoogleFormOptions>) => {
      return useGoogleForm({ formId: FORM_ID, fetch: vi.fn(), ...props });
    },
    { initialProps: options },
  );
};

const changeEvent = (value: string) => {
  return { target: { value } } as never;
};

const checkEvent = (checked: boolean) => {
  return { target: { checked } } as never;
};

describe("setValue / setValues", () => {
  it("setValue sets one field and keeps the others", () => {
    const { result } = setup({ initialValues: { "entry.1": "a" } });
    act(() => {
      result.current.setValue("entry.2", "b");
    });
    expect(result.current.values).toEqual({ "entry.1": "a", "entry.2": "b" });
  });

  it("setValues merges the patch into existing values", () => {
    const { result } = setup({
      initialValues: { "entry.1": "a", "entry.2": "b" },
    });
    act(() => {
      result.current.setValues({ "entry.2": "B", "entry.3": "c" });
    });
    expect(result.current.values).toEqual({
      "entry.1": "a",
      "entry.2": "B",
      "entry.3": "c",
    });
  });

  it("setValues with an empty patch keeps values", () => {
    const { result } = setup({ initialValues: { "entry.1": "a" } });
    act(() => {
      result.current.setValues({});
    });
    expect(result.current.values).toEqual({ "entry.1": "a" });
  });

  it("setValue and setValues keep a stable identity across renders", () => {
    const { result, rerender } = setup();
    const { setValue, setValues } = result.current;
    act(() => {
      result.current.setValue("entry.1", "x");
    });
    rerender({});
    expect(result.current.setValue).toBe(setValue);
    expect(result.current.setValues).toBe(setValues);
  });
});

describe("prefillUrl", () => {
  it("builds a viewform URL with usp=pp_url and entry params", () => {
    const { result } = setup({
      schema: loadDemoSchema(),
      initialValues: { "entry.111": "hello world", "entry.222": "x" },
    });
    const url = new URL(result.current.prefillUrl);
    expect(result.current.prefillUrl).toMatch(
      /^https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQLtestformidtestformid1234567\/viewform\?/,
    );
    expect(url.searchParams.get("usp")).toBe("pp_url");
    expect(url.searchParams.get("entry.111")).toBe("hello world");
    expect(url.searchParams.get("entry.222")).toBe("x");
  });

  it("updates when values change", () => {
    const { result } = setup();
    expect(new URL(result.current.prefillUrl).searchParams.get("entry.5")).toBe(
      null,
    );
    act(() => {
      result.current.setValue("entry.5", "later");
    });
    expect(new URL(result.current.prefillUrl).searchParams.get("entry.5")).toBe(
      "later",
    );
  });

  it("is an empty string when the formId is invalid", () => {
    const { result } = setup({ formId: "" });
    expect(result.current.prefillUrl).toBe("");
  });
});

describe("register", () => {
  it("returns name, empty string for unset, and a string value as-is", () => {
    const { result } = setup({ initialValues: { "entry.1": "hi" } });
    expect(result.current.register("entry.1")).toMatchObject({
      name: "entry.1",
      value: "hi",
    });
    expect(result.current.register("entry.9").value).toBe("");
  });

  it("stringifies number values", () => {
    const { result } = setup({ initialValues: { "entry.1": 42 } });
    expect(result.current.register("entry.1").value).toBe("42");
  });

  it("renders array and object values as an empty string", () => {
    const { result } = setup({
      initialValues: {
        "entry.1": ["a", "b"],
        "entry.2": { year: 2024, month: 1, day: 2 },
        "entry.3": null,
      },
    });
    expect(result.current.register("entry.1").value).toBe("");
    expect(result.current.register("entry.2").value).toBe("");
    expect(result.current.register("entry.3").value).toBe("");
  });

  it("onChange writes event.target.value into state", () => {
    const { result } = setup();
    act(() => {
      result.current.register("entry.1").onChange(changeEvent("typed"));
    });
    expect(result.current.values["entry.1"]).toBe("typed");
    expect(result.current.register("entry.1").value).toBe("typed");
  });

  it("reuses the same onChange per entry across renders and values changes", () => {
    const { result, rerender } = setup();
    const first = result.current.register("entry.1").onChange;
    act(() => {
      result.current.setValue("entry.1", "changed");
    });
    rerender({});
    expect(result.current.register("entry.1").onChange).toBe(first);
    expect(result.current.register("entry.2").onChange).not.toBe(first);
  });
});

describe("registerCheckbox and toggle_checkbox", () => {
  it("reports checked only when the option is in the array", () => {
    const { result } = setup({ initialValues: { "entry.1": ["a"] } });
    expect(result.current.registerCheckbox("entry.1", "a")).toMatchObject({
      name: "entry.1",
      value: "a",
      checked: true,
    });
    expect(result.current.registerCheckbox("entry.1", "b").checked).toBe(false);
    expect(result.current.registerCheckbox("entry.2", "a").checked).toBe(false);
  });

  it("checking adds the option", () => {
    const { result } = setup();
    act(() => {
      result.current
        .registerCheckbox("entry.1", "a")
        .onChange(checkEvent(true));
    });
    act(() => {
      result.current
        .registerCheckbox("entry.1", "b")
        .onChange(checkEvent(true));
    });
    expect(result.current.values["entry.1"]).toEqual(["a", "b"]);
  });

  it("checking an already-present option is a no-op", () => {
    const { result } = setup({ initialValues: { "entry.1": ["a"] } });
    act(() => {
      result.current
        .registerCheckbox("entry.1", "a")
        .onChange(checkEvent(true));
    });
    expect(result.current.values["entry.1"]).toEqual(["a"]);
  });

  it("unchecking removes the option and leaves an empty array", () => {
    const { result } = setup({ initialValues: { "entry.1": ["a", "b"] } });
    act(() => {
      result.current
        .registerCheckbox("entry.1", "a")
        .onChange(checkEvent(false));
    });
    expect(result.current.values["entry.1"]).toEqual(["b"]);
    act(() => {
      result.current
        .registerCheckbox("entry.1", "b")
        .onChange(checkEvent(false));
    });
    expect(result.current.values["entry.1"]).toEqual([]);
  });

  it("unchecking an option that was never set yields an empty array", () => {
    const { result } = setup();
    act(() => {
      result.current
        .registerCheckbox("entry.1", "a")
        .onChange(checkEvent(false));
    });
    expect(result.current.values["entry.1"]).toEqual([]);
  });

  it("reuses the checkbox handler per entry and option", () => {
    const { result } = setup();
    const a = result.current.registerCheckbox("entry.1", "a").onChange;
    act(() => {
      a(checkEvent(true));
    });
    expect(result.current.registerCheckbox("entry.1", "a").onChange).toBe(a);
    expect(result.current.registerCheckbox("entry.1", "b").onChange).not.toBe(
      a,
    );
    expect(result.current.registerCheckbox("entry.2", "a").onChange).not.toBe(
      a,
    );
  });

  // TODO(bug): toggling a plain checkbox option preserves an existing Other entry (useGoogleForm.ts:100-104 drops non-string items).
});

describe("reset", () => {
  it("without initialValues resets to an empty object and clears status", () => {
    const { result } = setup();
    act(() => {
      result.current.setValue("entry.1", "x");
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.values).toEqual({});
    expect(result.current.status).toBe("idle");
    expect(result.current.errors).toEqual([]);
  });

  it("restores initialValues after edits", () => {
    const { result } = setup({ initialValues: { "entry.1": "start" } });
    act(() => {
      result.current.setValues({ "entry.1": "edited", "entry.2": "extra" });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.values).toEqual({ "entry.1": "start" });
  });

  it("does not change state when initialValues identity changes on rerender", () => {
    const { result, rerender } = setup({ initialValues: { "entry.1": "a" } });
    act(() => {
      result.current.setValue("entry.1", "edited");
    });
    rerender({ initialValues: { "entry.1": "b" } });
    expect(result.current.values).toEqual({ "entry.1": "edited" });
  });

  it("uses the latest initialValues and a new reset identity after they change", () => {
    const { result, rerender } = setup({ initialValues: { "entry.1": "a" } });
    const firstReset = result.current.reset;
    rerender({ initialValues: { "entry.1": "b" } });
    expect(result.current.reset).not.toBe(firstReset);
    act(() => {
      result.current.reset();
    });
    expect(result.current.values).toEqual({ "entry.1": "b" });
  });

  it("keeps the same reset identity when initialValues is the same reference", () => {
    const initialValues = { "entry.1": "a" };
    const { result, rerender } = setup({ initialValues });
    const firstReset = result.current.reset;
    rerender({ initialValues });
    expect(result.current.reset).toBe(firstReset);
  });
});

describe("errors per field", () => {
  it("is not cleared by setValue (errors only clear on the next validate/submit/reset)", async () => {
    const schema = loadDemoSchema();
    const { result } = setup({ schema });
    await act(async () => {
      await result.current.submit();
    });
    const errorCount = result.current.errors.length;
    expect(errorCount).toBeGreaterThan(0);
    const entryId = result.current.errors[0]?.entryId ?? "";
    act(() => {
      result.current.setValue(entryId, "something");
    });
    expect(result.current.errors).toHaveLength(errorCount);
    act(() => {
      result.current.reset();
    });
    expect(result.current.errors).toEqual([]);
  });
});
