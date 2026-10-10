import {
  generateHtmlForm,
  generateReactComponent,
  generateSchemaJson,
  generateTypes,
} from "@ez-gform/codegen";
import { parseFormData, parseFormHtml } from "@ez-gform/core";
import type { FormSchema } from "@ez-gform/types";
import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const fixturesDir = fileURLToPath(
  new URL("../../../core/src/__fixtures__/", import.meta.url),
);

const fixturePath = (slug: string): string => {
  return `${fixturesDir}${slug}.json`;
};

const run = async (
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> => {
  try {
    const { stdout, stderr } = await execFileAsync("node", [cliPath, ...args]);
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: e.code ?? 1,
    };
  }
};

const htmlFixturePath = `${fixturesDir}all-question-types.html`;
const FORM_ID = "some-form-id-1234567890";

const ownVersion = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      "utf8",
    ),
  ) as { version: string }
).version;

/** Mirrors the CLI's stdout rule: exactly one trailing newline. */
const withNewline = (output: string): string => {
  return output.endsWith("\n") ? output : `${output}\n`;
};

const schemaFromJsonFixture = (slug: string): FormSchema => {
  return parseFormData(
    JSON.parse(readFileSync(fixturePath(slug), "utf8")) as unknown,
  );
};

const schemaFromHtmlFixture = (): FormSchema => {
  return parseFormHtml(readFileSync(htmlFixturePath, "utf8"));
};

const FIXTURE_SLUGS = ["all-question-types", "file-upload"] as const;

describe("ez-gform CLI", () => {
  it("prints help", async () => {
    const { stdout, code } = await run(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("ez-gform");
  });

  it("prints version", async () => {
    const { stdout, code } = await run(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it("exits 1 with no form argument", async () => {
    const { code, stderr } = await run([]);
    expect(code).toBe(1);
    expect(stderr).toContain("Usage");
  });

  it("exits 1 for an unknown --format", async () => {
    const { code, stderr } = await run([
      "some-form-id-1234567890",
      "--json-input",
      fixturePath("all-question-types"),
      "--format",
      "yaml",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("Unknown --format");
  });

  for (const slug of FIXTURE_SLUGS) {
    it(`--format json (default) for ${slug} matches parseFormData`, async () => {
      const { stdout, code } = await run([
        "some-form-id-1234567890",
        "--json-input",
        fixturePath(slug),
      ]);
      expect(code).toBe(0);
      const schema: unknown = JSON.parse(stdout);
      const raw = JSON.parse(
        readFileSync(fixturePath(slug), "utf8"),
      ) as unknown;
      expect(schema).toEqual(parseFormData(raw));
    });

    it(`--format types for ${slug} produces compilable-looking types`, async () => {
      const { stdout, code } = await run([
        "some-form-id-1234567890",
        "--json-input",
        fixturePath(slug),
        "--format",
        "types",
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain("as const satisfies FormSchema");
    });

    it(`--format react for ${slug} produces a component`, async () => {
      const { stdout, code } = await run([
        "some-form-id-1234567890",
        "--json-input",
        fixturePath(slug),
        "--format",
        "react",
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain("useGoogleForm");
    });

    it(`--format html for ${slug} produces a form`, async () => {
      const { stdout, code } = await run([
        "some-form-id-1234567890",
        "--json-input",
        fixturePath(slug),
        "--format",
        "html",
      ]);
      expect(code).toBe(0);
      expect(stdout).toContain("<form");
      expect(stdout).toContain("formResponse");
    });
  }

  it("accepts --name and uses it in generated types", async () => {
    const { stdout, code } = await run([
      "some-form-id-1234567890",
      "--json-input",
      fixturePath("all-question-types"),
      "--format",
      "types",
      "--name",
      "Custom",
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("export const CustomSchema");
  });

  it("submit exits 2 on validation failure without hitting the network", async () => {
    const { code, stderr } = await run([
      "submit",
      "some-form-id-1234567890",
      "--json-input",
      fixturePath("all-question-types"),
      "--data",
      "{}",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("Validation failed");
  });

  it("submit exits 1 when --data is missing", async () => {
    const { code, stderr } = await run([
      "submit",
      "some-form-id-1234567890",
      "--json-input",
      fixturePath("all-question-types"),
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("Usage");
  });

  describe("help and version flags", () => {
    it("-h prints the same usage as --help", async () => {
      const long = await run(["--help"]);
      const short = await run(["-h"]);
      expect(short.code).toBe(0);
      expect(short.stdout).toBe(long.stdout);
      expect(short.stdout).toContain("Usage:");
    });

    it("-v prints the same version as --version", async () => {
      const long = await run(["--version"]);
      const short = await run(["-v"]);
      expect(short.code).toBe(0);
      expect(short.stdout).toBe(long.stdout);
    });

    it("--version prints exactly the package.json version", async () => {
      const { stdout, code } = await run(["--version"]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${ownVersion}\n`);
    });

    it("--help after positionals prints usage", async () => {
      const { stdout, code } = await run([FORM_ID, "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("Usage:");
    });

    it("--version after positionals prints the version", async () => {
      const { stdout, code } = await run([FORM_ID, "--version"]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${ownVersion}\n`);
    });

    it("submit --help prints usage", async () => {
      const { stdout, code } = await run(["submit", "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("ez-gform submit");
    });
  });

  describe("--out", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "ez-gform-cli-test-"));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("writes the file verbatim and prints nothing to stdout", async () => {
      const outFile = join(dir, "schema.json");
      const { stdout, stderr, code } = await run([
        FORM_ID,
        "--json-input",
        fixturePath("file-upload"),
        "--out",
        outFile,
      ]);
      expect(code).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
      expect(readFileSync(outFile, "utf8")).toBe(
        generateSchemaJson(schemaFromJsonFixture("file-upload"), {
          pretty: true,
        }),
      );
    });

    it("--out file matches stdout except for the added trailing newline", async () => {
      const outFile = join(dir, "form.html");
      const args = [FORM_ID, "--json-input", fixturePath("file-upload")];
      const toStdout = await run([...args, "--format", "html"]);
      const toFile = await run([...args, "--format", "html", "--out", outFile]);
      expect(toFile.code).toBe(0);
      expect(withNewline(readFileSync(outFile, "utf8"))).toBe(toStdout.stdout);
    });

    it("fails with exit 2 when the output directory does not exist", async () => {
      const { code, stderr, stdout } = await run([
        FORM_ID,
        "--json-input",
        fixturePath("file-upload"),
        "--out",
        join(dir, "missing", "out.json"),
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("ENOENT");
    });

    it("does not write the file when the format is unknown", async () => {
      const outFile = join(dir, "never.txt");
      const { code } = await run([
        FORM_ID,
        "--json-input",
        fixturePath("file-upload"),
        "--format",
        "yaml",
        "--out",
        outFile,
      ]);
      expect(code).toBe(1);
      expect(readdirSync(dir)).toEqual([]);
    });
  });

  describe("--json-input sources", () => {
    it("parses the viewform HTML fixture", async () => {
      const { stdout, code } = await run([
        FORM_ID,
        "--json-input",
        htmlFixturePath,
      ]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout) as unknown).toEqual(schemaFromHtmlFixture());
    });
  });

  describe("--json-input errors", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "ez-gform-cli-test-"));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const garbageFile = (content: string): string => {
      const file = join(dir, "garbage.txt");
      writeFileSync(file, content, "utf8");
      return file;
    };

    it("generate: missing file exits 2 with ENOENT", async () => {
      const { code, stderr, stdout } = await run([
        FORM_ID,
        "--json-input",
        join(dir, "nope.json"),
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("ENOENT");
    });

    it("generate: non-JSON, non-HTML content exits 2 with a message", async () => {
      const { code, stderr, stdout } = await run([
        FORM_ID,
        "--json-input",
        garbageFile("this is not a form"),
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr.trim().length).toBeGreaterThan(0);
    });

    it("generate: malformed JSON array exits 2", async () => {
      const { code, stderr } = await run([
        FORM_ID,
        "--json-input",
        garbageFile("[1, 2,"),
      ]);
      expect(code).toBe(2);
      expect(stderr.trim().length).toBeGreaterThan(0);
    });

    it("submit: missing file exits 2 with ENOENT", async () => {
      const { code, stderr, stdout } = await run([
        "submit",
        FORM_ID,
        "--json-input",
        join(dir, "nope.json"),
        "--data",
        "{}",
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("ENOENT");
    });

    it("submit: garbage content exits 2 before any submission", async () => {
      const { code, stderr, stdout } = await run([
        "submit",
        FORM_ID,
        "--json-input",
        garbageFile("this is not a form"),
        "--data",
        "{}",
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr.trim().length).toBeGreaterThan(0);
    });
  });

  describe("submit --data handling", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "ez-gform-cli-test-"));
      mkdirSync(dir, { recursive: true });
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const submitArgs = (data: string): string[] => {
      return [
        "submit",
        FORM_ID,
        "--json-input",
        fixturePath("file-upload"),
        "--data",
        data,
      ];
    };

    it("invalid inline JSON exits 1 with 'Failed to read --data'", async () => {
      const { code, stderr, stdout } = await run(submitArgs("{not json"));
      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Failed to read --data");
    });

    it("--data @missing-file exits 1 with 'Failed to read --data'", async () => {
      const { code, stderr } = await run(
        submitArgs(`@${join(dir, "missing.json")}`),
      );
      expect(code).toBe(1);
      expect(stderr).toContain("Failed to read --data");
      expect(stderr).toContain("ENOENT");
    });

    it("--data @file with invalid JSON exits 1 with 'Failed to read --data'", async () => {
      const file = join(dir, "bad.json");
      writeFileSync(file, "{not json", "utf8");
      const { code, stderr } = await run(submitArgs(`@${file}`));
      expect(code).toBe(1);
      expect(stderr).toContain("Failed to read --data");
    });

    it("--data @file with valid JSON is read, then fails validation (exit 2)", async () => {
      const file = join(dir, "empty.json");
      writeFileSync(file, "{}", "utf8");
      const { code, stderr, stdout } = await run(submitArgs(`@${file}`));
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("Validation failed");
      expect(stderr).toContain("entry.83696370");
    });

    it("an invalid form argument is rejected after validation, before any fetch", async () => {
      // file-upload only requires entry.83696370, so this passes validation;
      // normalizeFormId then throws on the garbage positional before
      // submitForm is called, so nothing is sent.
      const { code, stderr, stdout } = await run([
        "submit",
        "not a form id",
        "--json-input",
        fixturePath("file-upload"),
        "--data",
        '{"entry.83696370":"x"}',
      ]);
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("normalizeFormId");
      expect(stderr).not.toContain("Validation failed");
    });
  });

  describe("every --format matches @ez-gform/codegen byte for byte", () => {
    const sources: [string, () => FormSchema, string][] = [
      [
        "all-question-types.json",
        () => {
          return schemaFromJsonFixture("all-question-types");
        },
        fixturePath("all-question-types"),
      ],
      [
        "file-upload.json",
        () => {
          return schemaFromJsonFixture("file-upload");
        },
        fixturePath("file-upload"),
      ],
      ["all-question-types.html", schemaFromHtmlFixture, htmlFixturePath],
    ];

    for (const [label, getSchema, inputPath] of sources) {
      const base = [FORM_ID, "--json-input", inputPath];

      it(`json for ${label}`, async () => {
        const { stdout, code } = await run([...base, "--format", "json"]);
        expect(code).toBe(0);
        expect(stdout).toBe(
          withNewline(generateSchemaJson(getSchema(), { pretty: true })),
        );
      });

      it(`types for ${label}`, async () => {
        const { stdout, code } = await run([...base, "--format", "types"]);
        expect(code).toBe(0);
        expect(stdout).toBe(
          withNewline(generateTypes(getSchema(), { name: undefined })),
        );
      });

      it(`types --name for ${label}`, async () => {
        const { stdout, code } = await run([
          ...base,
          "--format",
          "types",
          "--name",
          "Custom",
        ]);
        expect(code).toBe(0);
        expect(stdout).toBe(
          withNewline(generateTypes(getSchema(), { name: "Custom" })),
        );
      });

      it(`react for ${label}`, async () => {
        const { stdout, code } = await run([...base, "--format", "react"]);
        expect(code).toBe(0);
        expect(stdout).toBe(
          withNewline(generateReactComponent(getSchema(), { name: undefined })),
        );
      });

      it(`react --name for ${label}`, async () => {
        const { stdout, code } = await run([
          ...base,
          "--format",
          "react",
          "--name",
          "Custom",
        ]);
        expect(code).toBe(0);
        expect(stdout).toBe(
          withNewline(generateReactComponent(getSchema(), { name: "Custom" })),
        );
      });

      it(`html for ${label}`, async () => {
        const { stdout, code } = await run([...base, "--format", "html"]);
        expect(code).toBe(0);
        expect(stdout).toBe(withNewline(generateHtmlForm(getSchema())));
      });

      it(`html ignores --name for ${label}`, async () => {
        const { stdout, code } = await run([
          ...base,
          "--format",
          "html",
          "--name",
          "Custom",
        ]);
        expect(code).toBe(0);
        expect(stdout).toBe(withNewline(generateHtmlForm(getSchema())));
      });
    }
  });

  // The paths below are untestable until cli.ts is split so main() does not
  // run at import time (cli.ts:274-279) and fetch/exit are injectable.
  // TODO(untestable until cli split): fetchSchema must report a network error as "Failed to fetch <url>: <cause>" and exit 2 (cli.ts:76-83).
  // TODO(untestable until cli split): fetchSchema must report a 401 or an accounts.google.com redirect as the sign-in error and exit 2 (cli.ts:85-87).
  // TODO(untestable until cli split): fetchSchema must report a non-ok HTTP status as "Failed to fetch <url>: HTTP <status>" and exit 2 (cli.ts:89-93).
  // TODO(untestable until cli split): fetchSchema must report unparseable fetched HTML as "Failed to parse form HTML: <cause>" and exit 2 (cli.ts:96-102).
  // TODO(untestable until cli split): submit with valid data must call submitForm, print the result as JSON and exit 0 for sent/ok, 2 for error (cli.ts:249-252).
  // TODO(bug): a fetch that never responds should time out and be reported as a fetch error instead of hanging; no timeout exists (cli.ts:76).
});
