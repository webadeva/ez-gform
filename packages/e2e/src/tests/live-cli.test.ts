import {
  generateHtmlForm,
  generateReactComponent,
  generateTypes,
} from "@ez-gform/codegen";
import type { FormSchema } from "@ez-gform/types";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BOGUS_FORM_ID,
  LIVE_FORM_URL,
  SIGNIN_FORM_URL,
  fetchLiveSchema,
  runCli,
} from "../helpers/live.js";

const withNewline = (output: string): string => {
  return output.endsWith("\n") ? output : `${output}\n`;
};

const PLACEHOLDER = "FBZX";

// fbzx is a per-request token, so each CLI run (and each fetch) gets a new one,
// and generated types/react/html embed it. Mask it on both sides before comparing.
const maskFbzx = (output: string): string => {
  return output
    .replace(/("fbzx": ")[^"]*(")/g, `$1${PLACEHOLDER}$2`)
    .replace(/(name="fbzx" value=")[^"]*(")/g, `$1${PLACEHOLDER}$2`);
};

const withoutFbzx = (schema: FormSchema): Omit<FormSchema, "fbzx"> => {
  const copy: Partial<FormSchema> = { ...schema };
  delete copy.fbzx;
  return copy as Omit<FormSchema, "fbzx">;
};

const expectMatches = (stdout: string, generated: string): void => {
  expect(maskFbzx(stdout)).toContain(PLACEHOLDER);
  expect(maskFbzx(stdout)).toBe(maskFbzx(withNewline(generated)));
};

describe("ez-gform CLI against the live form", () => {
  let live: FormSchema;
  // Schema as emitted by the CLI's own json output: deterministic input for codegen.
  let cliSchema: FormSchema;

  beforeAll(async () => {
    live = await fetchLiveSchema();
    const result = await runCli([LIVE_FORM_URL, "--format", "json"]);
    expect(result.code).toBe(0);
    cliSchema = JSON.parse(result.stdout) as FormSchema;
  });

  it("--format json prints the live schema (fbzx aside)", () => {
    expect(withoutFbzx(cliSchema)).toEqual(withoutFbzx(live));
    expect(typeof cliSchema.fbzx).toBe("string");
  });

  it("--format types matches generateTypes on the CLI schema", async () => {
    const result = await runCli([LIVE_FORM_URL, "--format", "types"]);
    expect(result.code).toBe(0);
    expectMatches(result.stdout, generateTypes(cliSchema, { name: undefined }));
  });

  it("--format react matches generateReactComponent on the CLI schema", async () => {
    const result = await runCli([LIVE_FORM_URL, "--format", "react"]);
    expect(result.code).toBe(0);
    expectMatches(
      result.stdout,
      generateReactComponent(cliSchema, { name: undefined }),
    );
  });

  it("--format html matches generateHtmlForm on the CLI schema", async () => {
    const result = await runCli([LIVE_FORM_URL, "--format", "html"]);
    expect(result.code).toBe(0);
    expectMatches(result.stdout, generateHtmlForm(cliSchema));
  });

  it("exits 2 with the sign-in message for a restricted form", async () => {
    const result = await runCli([SIGNIN_FORM_URL]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("This form requires sign-in");
  });

  it("exits 2 with an HTTP 404 message for a non-existent form", async () => {
    const result = await runCli([BOGUS_FORM_ID]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`/forms/d/e/${BOGUS_FORM_ID}/viewform`);
    expect(result.stderr).toContain("HTTP 404");
  });
});
