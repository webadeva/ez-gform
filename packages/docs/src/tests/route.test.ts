import { parseFormHtml } from "@ez-gform/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/schema/route";

const coreOverrides = vi.hoisted(() => {
  const overrides: Partial<
    Record<"normalizeFormId" | "parseFormHtml", () => never>
  > = {};
  return overrides;
});

vi.mock("@ez-gform/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ez-gform/core")>();
  return {
    ...actual,
    normalizeFormId: (...args: Parameters<typeof actual.normalizeFormId>) => {
      return (coreOverrides.normalizeFormId ?? actual.normalizeFormId)(...args);
    },
    parseFormHtml: (...args: Parameters<typeof actual.parseFormHtml>) => {
      return (coreOverrides.parseFormHtml ?? actual.parseFormHtml)(...args);
    },
  };
});

const request = (query: string): Request => {
  return new Request(`http://localhost/api/schema${query}`);
};

describe("GET /api/schema — input validation", () => {
  it("returns 400 when formId is missing", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/formId/i);
  });

  it("returns 400 when formId is an empty string", async () => {
    const response = await GET(request("?formId=%20%20"));
    expect(response.status).toBe(400);
  });

  it("returns 400 when formId is not a recognizable form URL or id", async () => {
    const response = await GET(request("?formId=not a url at all"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/could not recognize/i);
  });

  it("accepts a bare form id and a docs.google.com URL alike (no 400)", async () => {
    // Stub fetch so this stays a validation test, not a network test — a
    // syntactically valid id/URL should pass normalizeFormId and reach the
    // fetch step at all, proving validation didn't reject a well-formed id.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );

    const bareId = await GET(
      request(
        "?formId=1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw",
      ),
    );
    expect(bareId.status).not.toBe(400);

    const fullUrl = await GET(
      request(
        "?formId=" +
          encodeURIComponent(
            "https://docs.google.com/forms/d/e/1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw/viewform",
          ),
      ),
    );
    expect(fullUrl.status).not.toBe(400);
  });
});

const FORM_ID = "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw";
const VIEWFORM = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`;

const fixtureHtml = readFileSync(
  resolve(process.cwd(), "../core/src/__fixtures__/all-question-types.html"),
  "utf8",
);

const stubFetch = (impl: (...args: unknown[]) => unknown) => {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
};

const nonError = (value: string): unknown => {
  return value;
};

const withUrl = (response: Response, url: string): Response => {
  Object.defineProperty(response, "url", { value: url });
  return response;
};

const errorOf = async (response: Response): Promise<string> => {
  const body = (await response.json()) as { error: string };
  return body.error;
};

describe("GET /api/schema — upstream handling", () => {
  it("returns 200 with the parsed schema and calls fetch with the viewform URL, User-Agent and signal", async () => {
    const fetchMock = stubFetch(() => {
      return new Response(fixtureHtml, { status: 200 });
    });

    const response = await GET(request(`?formId=${FORM_ID}`));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { schema: unknown };
    expect(body.schema).toEqual(
      JSON.parse(JSON.stringify(parseFormHtml(fixtureHtml))),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(VIEWFORM);
    expect(new Headers(init.headers).get("user-agent")).toMatch(/Mozilla/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns 401 when upstream responds 401", async () => {
    stubFetch(() => {
      return new Response("", { status: 401 });
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toMatch(/requires sign-in/);
  });

  it("returns 401 when upstream redirected to accounts.google.com", async () => {
    stubFetch(() => {
      return withUrl(
        new Response("<html></html>", { status: 200 }),
        "https://accounts.google.com/ServiceLogin?continue=x",
      );
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toMatch(/requires sign-in/);
  });

  it("returns 404 when upstream responds 404", async () => {
    stubFetch(() => {
      return new Response("", { status: 404 });
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(`Form not found at "${VIEWFORM}"`);
  });

  it("returns 502 for any other non-ok upstream status", async () => {
    stubFetch(() => {
      return new Response("", { status: 500 });
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe(
      `Failed to fetch "${VIEWFORM}": HTTP 500`,
    );
  });

  it("returns 502 when fetch rejects", async () => {
    stubFetch(() => {
      return Promise.reject(new Error("connection reset"));
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe(
      `Failed to fetch "${VIEWFORM}": connection reset`,
    );
  });

  it("returns 422 when the HTML has no FB_PUBLIC_LOAD_DATA_", async () => {
    stubFetch(() => {
      return new Response("<html><body>nope</body></html>", { status: 200 });
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatch(/^Failed to parse form HTML: /);
  });
  it("returns 502 with a stringified message when fetch rejects with a non-Error", async () => {
    stubFetch(() => {
      throw nonError("socket hang up");
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe(
      `Failed to fetch "${VIEWFORM}": socket hang up`,
    );
  });
});

describe("GET /api/schema — non-Error throws from @ez-gform/core", () => {
  it("returns 400 with a stringified cause when normalizeFormId throws a non-Error", async () => {
    coreOverrides.normalizeFormId = () => {
      throw nonError("bad id");
    };
    const response = await GET(request("?formId=whatever"));
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/: bad id$/);
  });

  it("returns 422 with a stringified cause when parseFormHtml throws a non-Error", async () => {
    coreOverrides.parseFormHtml = () => {
      throw nonError("bad html");
    };
    stubFetch(() => {
      return new Response("<html></html>", { status: 200 });
    });
    const response = await GET(request(`?formId=${FORM_ID}`));
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe("Failed to parse form HTML: bad html");
  });
});

describe("GET /api/schema — timeout", () => {
  it("returns 502 with a timeout message when fetch exceeds 10s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stubFetch((_url, init) => {
      const { signal } = init as { signal: AbortSignal };
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const pending = GET(request(`?formId=${FORM_ID}`));
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe(
      `Timed out fetching "${VIEWFORM}" after 10000ms`,
    );
  });
});

afterEach(() => {
  delete coreOverrides.normalizeFormId;
  delete coreOverrides.parseFormHtml;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
