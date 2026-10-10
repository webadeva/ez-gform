import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ParseError } from "../errors.js";
import { extractFbzx, extractPublicLoadData } from "../extract.js";

const fixturesDir = fileURLToPath(new URL("../__fixtures__/", import.meta.url));

describe("extractPublicLoadData", () => {
  it("extracts and JSON.parses the array from all-question-types.html", () => {
    const html = readFileSync(`${fixturesDir}all-question-types.html`, "utf8");
    const data = extractPublicLoadData(html);
    expect(data).toEqual(
      JSON.parse(readFileSync(`${fixturesDir}all-question-types.json`, "utf8")),
    );
  });

  it("throws ParseError when the marker is absent", () => {
    expect(() => {
      return extractPublicLoadData("<html><body>nope</body></html>");
    }).toThrow(ParseError);
  });

  it("throws ParseError on a malformed assignment", () => {
    expect(() => {
      return extractPublicLoadData("var FB_PUBLIC_LOAD_DATA_ ");
    }).toThrow(ParseError);
  });

  it("throws ParseError when the array literal is unterminated", () => {
    expect(() => {
      return extractPublicLoadData("var FB_PUBLIC_LOAD_DATA_ = [1, 2, [3");
    }).toThrow(ParseError);
  });

  it("correctly bracket-matches nested arrays and brackets inside strings", () => {
    const html =
      'var FB_PUBLIC_LOAD_DATA_ = [1, "a ] weird [ string", [2, 3]];</script>';
    const data = extractPublicLoadData(html);
    expect(data).toEqual([1, "a ] weird [ string", [2, 3]]);
  });

  it("throws ParseError when the assignment is not an array literal", () => {
    expect(() => {
      return extractPublicLoadData('var FB_PUBLIC_LOAD_DATA_ = {"a":1};');
    }).toThrow(/expected array literal/);
    expect(() => {
      return extractPublicLoadData("var FB_PUBLIC_LOAD_DATA_ =");
    }).toThrow(ParseError);
  });

  it("throws ParseError carrying the JSON.parse message when the literal is invalid JSON", () => {
    let caught: unknown;
    try {
      extractPublicLoadData("var FB_PUBLIC_LOAD_DATA_ = [1,];");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).message).toMatch(
      /failed to JSON\.parse the extracted FB_PUBLIC_LOAD_DATA_ literal: .+/,
    );
  });

  it("keeps the original JSON.parse SyntaxError as the ParseError cause", () => {
    let caught: unknown;
    try {
      extractPublicLoadData("var FB_PUBLIC_LOAD_DATA_ = [1,];");
    } catch (error) {
      caught = error;
    }
    const { cause } = caught as ParseError;
    expect(cause).toBeInstanceOf(SyntaxError);
    expect((caught as ParseError).message).toContain(
      (cause as SyntaxError).message,
    );
  });

  it("respects escaped quotes and escaped backslashes inside strings", () => {
    const html =
      'var FB_PUBLIC_LOAD_DATA_ = ["say \\"]\\" now", "back\\\\", [1]];</script>';
    expect(extractPublicLoadData(html)).toEqual(['say "]" now', "back\\", [1]]);
  });
});

describe("extractFbzx", () => {
  it("extracts fbzx from all-question-types.html", () => {
    const html = readFileSync(`${fixturesDir}all-question-types.html`, "utf8");
    const fbzx = extractFbzx(html);
    expect(fbzx).toBeDefined();
    expect(fbzx?.length).toBeGreaterThan(0);
  });

  it("returns undefined when no fbzx input is present", () => {
    expect(extractFbzx("<html></html>")).toBeUndefined();
  });
});
