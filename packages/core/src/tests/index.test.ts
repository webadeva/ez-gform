import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as core from "../index.js";

describe("public exports", () => {
  it.each([
    "encodeValues",
    "validateValues",
    "ParseError",
    "ValidationError",
    "extractPublicLoadData",
    "parseFormData",
    "parseFormHtml",
    "buildPrefillUrl",
    "buildSubmitBody",
    "submitForm",
    "formUrls",
    "normalizeFormId",
  ])("exports %s as a function", (name) => {
    expect(typeof (core as Record<string, unknown>)[name]).toBe("function");
  });

  it("exports VERSION as a string", () => {
    expect(typeof core.VERSION).toBe("string");
  });

  it("does not export extractFbzx", () => {
    expect("extractFbzx" in core).toBe(false);
  });

  it("exports no unexpected runtime members", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        "ParseError",
        "VERSION",
        "ValidationError",
        "buildPrefillUrl",
        "buildSubmitBody",
        "encodeValues",
        "extractPublicLoadData",
        "formUrls",
        "normalizeFormId",
        "parseFormData",
        "parseFormHtml",
        "submitForm",
        "validateValues",
      ].sort(),
    );
  });

  it("exports VERSION equal to the package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { version: string };
    expect(core.VERSION).toBe(pkg.version);
  });
});

describe("package.json", () => {
  it("is readable (sanity for the VERSION todo)", () => {
    const pkg = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { version: string };
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
