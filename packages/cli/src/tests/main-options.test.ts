import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMain } from "./helpers.js";

const fixturesDir = fileURLToPath(
  new URL("../../../core/src/__fixtures__/", import.meta.url),
);
const htmlPath = `${fixturesDir}all-question-types.html`;
const html = readFileSync(htmlPath, "utf8");
const FORM_ID = "some-form-id-1234567890";
const VIEWFORM = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`;

/** A fetch that never answers but rejects with an AbortError once its signal aborts. */
const hangingFetch: typeof fetch = (_input, init) => {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("This operation was aborted", "AbortError"));
    });
  });
};

afterEach(() => {
  vi.useRealTimers();
});

describe("--timeout", () => {
  it("aborts a hanging form fetch after the default 15000 ms", async () => {
    vi.useFakeTimers();
    const pending = runMain([FORM_ID], hangingFetch);
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      `Failed to fetch "${VIEWFORM}": timed out after 15000 ms\n`,
    );
    expect(vi.getTimerCount()).toBe(0);
  }, 2000);

  it("honours --timeout for generate", async () => {
    vi.useFakeTimers();
    const pending = runMain([FORM_ID, "--timeout", "50"], hangingFetch);
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      `Failed to fetch "${VIEWFORM}": timed out after 50 ms\n`,
    );
  }, 2000);

  it("honours --timeout for submit", async () => {
    vi.useFakeTimers();
    const pending = runMain(
      ["submit", FORM_ID, "--data", "{}", "--timeout", "50"],
      hangingFetch,
    );
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      `Failed to fetch "${VIEWFORM}": timed out after 50 ms\n`,
    );
  }, 2000);

  it.each(["0", "-5", "abc", "1.5", ""])(
    "rejects invalid --timeout %j",
    async (value) => {
      for (const argv of [
        [FORM_ID, `--timeout=${value}`],
        ["submit", FORM_ID, "--data", "{}", `--timeout=${value}`],
      ]) {
        const result = await runMain(argv);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
          `Invalid --timeout "${value}" (expected a positive integer of milliseconds)\n\nUsage:`,
        );
      }
    },
  );

  it("still validates --timeout when --json-input is given", async () => {
    const result = await runMain([
      FORM_ID,
      "--json-input",
      htmlPath,
      "--timeout",
      "abc",
    ]);
    expect(result.code).toBe(1);
  });

  it("clears the timer after a successful fetch", async () => {
    vi.useFakeTimers();
    const result = await runMain([FORM_ID], () => {
      return Promise.resolve(new Response(html, { status: 200 }));
    });
    expect(result.code).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after a non-ok response", async () => {
    vi.useFakeTimers();
    const result = await runMain([FORM_ID], () => {
      return Promise.resolve(new Response("nope", { status: 500 }));
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(`Failed to fetch "${VIEWFORM}": HTTP 500\n`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after a sign-in response", async () => {
    vi.useFakeTimers();
    const result = await runMain([FORM_ID], () => {
      return Promise.resolve(new Response("", { status: 401 }));
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("requires sign-in");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a timeout while the body is still being read", async () => {
    vi.useFakeTimers();
    const stalledBody: typeof fetch = (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start: (streamController) => {
          init?.signal?.addEventListener("abort", () => {
            streamController.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const pending = runMain([FORM_ID, "--timeout", "50"], stalledBody);
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      `Failed to fetch "${VIEWFORM}": timed out after 50 ms\n`,
    );
    expect(vi.getTimerCount()).toBe(0);
  }, 2000);

  it("reports a body read failure that is not a timeout", async () => {
    const brokenBody: typeof fetch = () => {
      const body = new ReadableStream<Uint8Array>({
        start: (streamController) => {
          streamController.error(new Error("socket hang up"));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const result = await runMain([FORM_ID], brokenBody);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      `Failed to fetch "${VIEWFORM}": socket hang up\n`,
    );
  });

  it("clears the timer after a network error", async () => {
    vi.useFakeTimers();
    const result = await runMain([FORM_ID]);
    expect(result.code).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("generate without a positional", () => {
  it("accepts --json-input alone and matches the positional output", async () => {
    const withPositional = await runMain([
      FORM_ID,
      "--json-input",
      htmlPath,
      "--format",
      "json",
    ]);
    const alone = await runMain(["--json-input", htmlPath, "--format", "json"]);
    expect(alone.code).toBe(0);
    expect(alone.stdout).toBe(withPositional.stdout);
  });

  it("still requires the positional when neither is given", async () => {
    const result = await runMain([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Missing <form-url-or-id>.\n\nUsage:");
  });
});
