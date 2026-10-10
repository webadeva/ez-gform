import {
  generateHtmlForm,
  generateReactComponent,
  generateSchemaJson,
  generateTypes,
} from "@ez-gform/codegen";
import * as core from "@ez-gform/core";
import { formUrls, normalizeFormId, parseFormHtml } from "@ez-gform/core";
import type { FormSchema } from "@ez-gform/types";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../main.js";
import { runMain } from "./helpers.js";

// Delegate to the real implementations; individual tests override them once to
// reach error paths that real inputs cannot (non-Error throws, generator bugs).
vi.mock("@ez-gform/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ez-gform/core")>();
  return {
    ...actual,
    parseFormHtml: vi.fn(actual.parseFormHtml),
    parseFormData: vi.fn(actual.parseFormData),
  };
});
vi.mock("@ez-gform/codegen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ez-gform/codegen")>();
  return { ...actual, generateSchemaJson: vi.fn(actual.generateSchemaJson) };
});

const fixturesDir = fileURLToPath(
  new URL("../../../core/src/__fixtures__/", import.meta.url),
);
const html = await readFile(`${fixturesDir}all-question-types.html`, "utf8");
const fileUploadJson = `${fixturesDir}file-upload.json`;
const schema: FormSchema = parseFormHtml(html);

const FORM_ID = "some-form-id-1234567890";
const VIEWFORM = formUrls(normalizeFormId(FORM_ID)).viewform;
const FORM_RESPONSE = formUrls(normalizeFormId(FORM_ID)).formResponse;

const ownVersion = (
  JSON.parse(
    await readFile(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      "utf8",
    ),
  ) as { version: string }
).version;

const withNewline = (output: string): string => {
  return output.endsWith("\n") ? output : `${output}\n`;
};

const VALID_DATA = {
  "entry.2028813558": "hi",
  "entry.1536687708": "Alpha",
  "entry.1985580588": "One",
  "entry.1304572283": ["A", "B"],
  "entry.1044963262": 3,
  "entry.1697966657": "Low",
  "entry.258902491": "Mid",
  "entry.1384108908": { year: 2024, month: 5, day: 6 },
};

const htmlResponse = (body = html): Response => {
  return new Response(body, { status: 200 });
};

/** Serves the fixture HTML for GETs and `post` for the formResponse POST. */
const formFetch = (post: () => Promise<Response>) => {
  return vi.fn<typeof fetch>((input, init) => {
    if (init?.method === "POST") {
      return post();
    }
    expect(input).toBe(VIEWFORM);
    return Promise.resolve(htmlResponse());
  });
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ez-gform-main-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("main: fetching the schema", () => {
  it("exits 2 when the network rejects with an Error", async () => {
    const { code, stderr, stdout } = await runMain([FORM_ID], () => {
      return Promise.reject(new Error("boom"));
    });
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toBe(`Failed to fetch "${VIEWFORM}": boom\n`);
  });

  it("stringifies a non-Error rejection", async () => {
    const rejecting = vi.fn<typeof fetch>().mockRejectedValue("plain string");
    const { code, stderr } = await runMain([FORM_ID], rejecting);
    expect(code).toBe(2);
    expect(stderr).toBe(`Failed to fetch "${VIEWFORM}": plain string\n`);
  });

  it("reports the sign-in error for HTTP 401", async () => {
    const { code, stderr } = await runMain([FORM_ID], () => {
      return Promise.resolve(new Response("", { status: 401 }));
    });
    expect(code).toBe(2);
    expect(stderr).toContain("This form requires sign-in");
  });

  it("reports the sign-in error when redirected to accounts.google.com", async () => {
    const { code, stderr } = await runMain([FORM_ID], () => {
      const res = new Response(html, { status: 200 });
      Object.defineProperty(res, "url", {
        value: "https://accounts.google.com/ServiceLogin",
      });
      return Promise.resolve(res);
    });
    expect(code).toBe(2);
    expect(stderr).toContain("This form requires sign-in");
  });

  it.each([404, 500])("reports HTTP %i", async (status) => {
    const { code, stderr } = await runMain([FORM_ID], () => {
      return Promise.resolve(new Response("", { status }));
    });
    expect(code).toBe(2);
    expect(stderr).toBe(`Failed to fetch "${VIEWFORM}": HTTP ${status}\n`);
  });

  it("reports unparseable HTML", async () => {
    const { code, stderr } = await runMain([FORM_ID], () => {
      return Promise.resolve(htmlResponse("<html>nothing here</html>"));
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/^Failed to parse form HTML: .+\n$/);
  });
});

describe("main: generate", () => {
  const expected: Record<string, (name?: string) => string> = {
    json: () => {
      return generateSchemaJson(schema, { pretty: true });
    },
    types: (name) => {
      return generateTypes(schema, { name });
    },
    react: (name) => {
      return generateReactComponent(schema, { name });
    },
    html: () => {
      return generateHtmlForm(schema);
    },
  };

  describe.each(Object.keys(expected))("--format %s", (format) => {
    it("prints the generated output for the fetched form", async () => {
      const fetchSpy = vi.fn<typeof fetch>(() => {
        return Promise.resolve(htmlResponse());
      });
      const { code, stdout, stderr } = await runMain(
        [FORM_ID, "--format", format],
        fetchSpy,
      );
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toBe(withNewline(expected[format]?.() ?? ""));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] ?? [];
      expect(url).toBe(VIEWFORM);
      expect(init?.headers).toEqual({
        "User-Agent": expect.stringContaining("Mozilla/5.0") as string,
      });
    });

    it("honours --name", async () => {
      const { code, stdout } = await runMain(
        [FORM_ID, "--format", format, "--name", "CustomName"],
        () => {
          return Promise.resolve(htmlResponse());
        },
      );
      expect(code).toBe(0);
      expect(stdout).toBe(withNewline(expected[format]?.("CustomName") ?? ""));
    });
  });

  it("defaults to json", async () => {
    const { code, stdout } = await runMain([FORM_ID], () => {
      return Promise.resolve(htmlResponse());
    });
    expect(code).toBe(0);
    expect(stdout).toBe(
      withNewline(generateSchemaJson(schema, { pretty: true })),
    );
  });

  it("exits 1 with usage on an unknown --format", async () => {
    const { code, stderr, stdout } = await runMain(
      [FORM_ID, "--format", "yaml"],
      () => {
        return Promise.resolve(htmlResponse());
      },
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Unknown --format "yaml"');
    expect(stderr).toContain("Usage:");
  });

  it("--out writes the file and prints nothing", async () => {
    const out = join(dir, "schema.json");
    const { code, stdout, stderr } = await runMain(
      [FORM_ID, "--out", out],
      () => {
        return Promise.resolve(htmlResponse());
      },
    );
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(await readFile(out, "utf8")).toBe(
      generateSchemaJson(schema, { pretty: true }),
    );
  });

  it("exits 2 with the message when --json-input points at a missing file", async () => {
    const { code, stderr } = await runMain([
      FORM_ID,
      "--json-input",
      join(dir, "missing.json"),
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("ENOENT");
  });

  it("exits 2 when --json-input is not valid JSON", async () => {
    const file = join(dir, "bad.json");
    await writeFile(file, "[not json", "utf8");
    const { code, stderr } = await runMain([FORM_ID, "--json-input", file]);
    expect(code).toBe(2);
    expect(stderr.length).toBeGreaterThan(1);
  });

  it("exits 1 when the positional is missing and there is no --json-input", async () => {
    const { code, stderr } = await runMain([]);
    expect(code).toBe(1);
    expect(stderr).toContain("Missing <form-url-or-id>.");
    expect(stderr).toContain("Usage:");
  });
});

describe("main: help and version", () => {
  it.each(["-h", "--help"])("top-level %s prints usage", async (flag) => {
    const { code, stdout } = await runMain([flag]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  it.each(["-v", "--version"])(
    "top-level %s prints the version",
    async (flag) => {
      const { code, stdout } = await runMain([flag]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${ownVersion}\n`);
    },
  );

  it("generate --help after a positional prints usage", async () => {
    const { code, stdout } = await runMain([FORM_ID, "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("ez-gform submit");
  });

  it("generate --version after a positional prints the version", async () => {
    const { code, stdout } = await runMain([FORM_ID, "--version"]);
    expect(code).toBe(0);
    expect(stdout).toBe(`${ownVersion}\n`);
  });

  it("submit --help prints usage", async () => {
    const { code, stdout } = await runMain(["submit", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  it("rejects on an unknown flag (generate)", async () => {
    await expect(runMain([FORM_ID, "--bogus"])).rejects.toThrow(/--bogus/);
  });

  it("rejects on an unknown flag (submit)", async () => {
    await expect(runMain(["submit", FORM_ID, "--bogus"])).rejects.toThrow(
      /--bogus/,
    );
  });
});

describe("main: submit", () => {
  const data = JSON.stringify(VALID_DATA);

  it("prints the result JSON and exits 0 on a 200", async () => {
    const fetchSpy = formFetch(() => {
      return Promise.resolve(new Response("", { status: 200 }));
    });
    const { code, stdout } = await runMain(
      ["submit", FORM_ID, "--data", data],
      fetchSpy,
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ status: "ok", httpStatus: 200 });
    const post = fetchSpy.mock.calls.find(([, init]) => {
      return init?.method === "POST";
    });
    expect(post?.[0]).toBe(FORM_RESPONSE);
    expect(post?.[1]?.mode).toBe("cors");
    expect(post?.[1]?.body).toEqual(
      expect.stringContaining("entry.2028813558=hi"),
    );
  });

  it("exits 2 with the error result on a 500", async () => {
    const { code, stdout } = await runMain(
      ["submit", FORM_ID, "--data", data],
      formFetch(() => {
        return Promise.resolve(new Response("", { status: 500 }));
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({
      status: "error",
      httpStatus: 500,
    });
  });

  it("exits 2 with the error result when the POST rejects", async () => {
    const { code, stdout } = await runMain(
      ["submit", FORM_ID, "--data", data],
      formFetch(() => {
        return Promise.reject(new Error("offline"));
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ status: "error" });
  });

  it("reads --data from @file", async () => {
    const file = join(dir, "data.json");
    await writeFile(file, data, "utf8");
    const { code, stdout } = await runMain(
      ["submit", FORM_ID, "--data", `@${file}`],
      formFetch(() => {
        return Promise.resolve(new Response("", { status: 200 }));
      }),
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ status: "ok", httpStatus: 200 });
  });

  it("submits against a --json-input schema without fetching it", async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => {
      return Promise.resolve(new Response("", { status: 200 }));
    });
    const { code } = await runMain(
      [
        "submit",
        FORM_ID,
        "--json-input",
        fileUploadJson,
        "--data",
        '{"entry.83696370":"x"}',
      ],
      fetchSpy,
    );
    expect(code).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(FORM_RESPONSE);
  });

  it("exits 1 on invalid --data JSON", async () => {
    const { code, stderr, stdout } = await runMain(
      ["submit", FORM_ID, "--data", "{not json"],
      formFetch(() => {
        return Promise.resolve(new Response("", { status: 200 }));
      }),
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Failed to read --data:");
  });

  it("exits 1 when the @file for --data is missing", async () => {
    const { code, stderr } = await runMain(
      ["submit", FORM_ID, "--data", `@${join(dir, "nope.json")}`],
      formFetch(() => {
        return Promise.resolve(new Response("", { status: 200 }));
      }),
    );
    expect(code).toBe(1);
    expect(stderr).toContain("Failed to read --data:");
  });

  it("exits 2 on validation failure and never POSTs", async () => {
    const fetchSpy = formFetch(() => {
      return Promise.resolve(new Response("", { status: 200 }));
    });
    const { code, stderr } = await runMain(
      ["submit", FORM_ID, "--data", "{}"],
      fetchSpy,
    );
    expect(code).toBe(2);
    expect(stderr).toContain("Validation failed:\n  - entry.2028813558: ");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("exits 1 with submit usage when --data is missing", async () => {
    const { code, stderr } = await runMain(["submit", FORM_ID]);
    expect(code).toBe(1);
    expect(stderr).toContain("Usage: ez-gform submit");
  });

  it("exits 1 with submit usage when the positional is missing", async () => {
    const { code, stderr } = await runMain(["submit", "--data", "{}"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Usage: ez-gform submit");
  });

  it("exits 2 when the schema fetch fails", async () => {
    const { code, stderr } = await runMain(
      ["submit", FORM_ID, "--data", data],
      () => {
        return Promise.resolve(new Response("", { status: 404 }));
      },
    );
    expect(code).toBe(2);
    expect(stderr).toBe(`Failed to fetch "${VIEWFORM}": HTTP 404\n`);
  });

  it("rejects when --json-input is a missing file", async () => {
    await expect(
      runMain([
        "submit",
        FORM_ID,
        "--json-input",
        join(dir, "missing.json"),
        "--data",
        "{}",
      ]),
    ).rejects.toThrow(/ENOENT/);
  });
});

describe("main: default dependencies", () => {
  it("falls back to process stdout and global fetch", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      return true;
    });
    const writeErr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => {
        return true;
      });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 500 }));
    try {
      expect(await main([FORM_ID])).toBe(2);
      expect(await main(["--help"])).toBe(0);
      expect(fetchSpy).toHaveBeenCalledWith(VIEWFORM, expect.anything());
      expect(writeErr).toHaveBeenCalledWith(
        `Failed to fetch "${VIEWFORM}": HTTP 500\n`,
      );
      expect(write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("main: unexpected failures", () => {
  it("stringifies a non-Error thrown by the HTML parser", async () => {
    vi.mocked(core.parseFormHtml).mockImplementationOnce(() => {
      throw "parser exploded" as unknown as Error;
    });
    const { code, stderr } = await runMain([FORM_ID], () => {
      return Promise.resolve(htmlResponse());
    });
    expect(code).toBe(2);
    expect(stderr).toBe("Failed to parse form HTML: parser exploded\n");
  });

  it("stringifies a non-Error thrown while loading --json-input", async () => {
    const file = join(dir, "form.json");
    await writeFile(file, "[1]", "utf8");
    vi.mocked(core.parseFormData).mockImplementationOnce(() => {
      throw "bad data" as unknown as Error;
    });
    const { code, stderr } = await runMain([FORM_ID, "--json-input", file]);
    expect(code).toBe(2);
    expect(stderr).toBe("bad data\n");
  });

  it("rejects when a generator throws a non-usage error", async () => {
    vi.mocked(generateSchemaJson).mockImplementationOnce(() => {
      throw new Error("generator bug");
    });
    await expect(
      runMain([FORM_ID], () => {
        return Promise.resolve(htmlResponse());
      }),
    ).rejects.toThrow("generator bug");
  });
});
