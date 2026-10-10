import { describe, expect, it } from "vitest";
import { toIdentifier, toPascalCase } from "../names.js";

const RESERVED = [
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "enum",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "await",
  "null",
  "true",
  "false",
];

describe("toPascalCase", () => {
  it("converts a title with spaces to PascalCase", () => {
    expect(toPascalCase("Event RSVP Form")).toBe("EventRsvpForm");
  });

  it("strips punctuation", () => {
    expect(toPascalCase("Booking Request - 2024!")).toBe("BookingRequest2024");
  });

  it("falls back to Form for an empty/unusable string", () => {
    expect(toPascalCase("")).toBe("Form");
    expect(toPascalCase("!!!")).toBe("Form");
  });

  it("splits camelCase words", () => {
    expect(toPascalCase("fooBar")).toBe("FooBar");
    expect(toPascalCase("fooBarBaz")).toBe("FooBarBaz");
  });

  it("splits acronym boundaries", () => {
    expect(toPascalCase("HTMLForm")).toBe("HtmlForm");
  });

  it("splits a lowercase/digit run followed by an uppercase letter", () => {
    expect(toPascalCase("abc1Def")).toBe("Abc1Def");
  });

  it("falls back to Form for whitespace-only and punctuation-only input", () => {
    expect(toPascalCase("   ")).toBe("Form");
    expect(toPascalCase("-_.,/")).toBe("Form");
  });

  it("falls back to Form for non-ASCII-only input", () => {
    expect(toPascalCase("日本語")).toBe("Form");
    expect(toPascalCase("🎉")).toBe("Form");
  });

  it("drops non-ASCII letters but keeps the ASCII words around them", () => {
    expect(toPascalCase("café menu")).toBe("CafMenu");
  });

  it("keeps a leading digit (currently an invalid TS identifier)", () => {
    // TODO(bug): toPascalCase should never return a digit-leading name, since
    // generateTypes emits it as `${name}Schema` only by luck of the suffix but
    // generateReact emits it as a bare component name (e.g. `2024Booking`).
    expect(toPascalCase("2024 Booking")).toBe("2024Booking");
  });
});

describe("toIdentifier", () => {
  it("converts a title to camelCase", () => {
    expect(toIdentifier("Event RSVP Form")).toBe("eventRsvpForm");
  });

  it("prefixes a leading digit", () => {
    expect(toIdentifier("2024 Booking")).toBe("_2024Booking");
  });

  it("falls back to Form for an empty string", () => {
    expect(toIdentifier("")).toBe("Form");
  });

  it("falls back to Form for emoji-only input", () => {
    expect(toIdentifier("🎉")).toBe("Form");
  });

  it("suffixes an underscore for a reserved word (capitalized)", () => {
    expect(toIdentifier("Delete")).toBe("delete_");
  });

  it("suffixes an underscore for a reserved word (lowercase)", () => {
    expect(toIdentifier("class")).toBe("class_");
  });

  it("prefixes a leading digit with words following", () => {
    expect(toIdentifier("123 go")).toBe("_123Go");
  });

  it("splits camelCase words", () => {
    expect(toIdentifier("fooBar")).toBe("fooBar");
  });

  it("splits acronym boundaries and lowercases the first word", () => {
    expect(toIdentifier("HTMLForm")).toBe("htmlForm");
  });

  it("falls back to Form for punctuation-only and whitespace-only input", () => {
    expect(toIdentifier("!!!")).toBe("Form");
    expect(toIdentifier("   ")).toBe("Form");
  });

  it("drops non-ASCII letters", () => {
    expect(toIdentifier("日本語")).toBe("Form");
    expect(toIdentifier("café menu")).toBe("cafMenu");
  });

  it.each(RESERVED)("suffixes an underscore for reserved word %s", (word) => {
    expect(toIdentifier(word)).toBe(`${word}_`);
  });

  it("does not suffix a non-reserved word that merely contains a reserved one", () => {
    expect(toIdentifier("classes")).toBe("classes");
    expect(toIdentifier("delete me")).toBe("deleteMe");
  });

  it("does not guard strict-mode binding names outside the reserved list", () => {
    // TODO(bug): `eval` and `arguments` are not valid binding identifiers in
    // strict mode, so toIdentifier should suffix them like reserved words.
    expect(toIdentifier("eval")).toBe("eval");
    expect(toIdentifier("arguments")).toBe("arguments");
  });
});
