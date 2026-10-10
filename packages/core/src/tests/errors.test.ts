import { describe, expect, it } from "vitest";
import { ParseError, ValidationError } from "../errors.js";

describe("ParseError", () => {
  it("is an Error subclass with the right name/message", () => {
    const err = new ParseError("bad shape");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ParseError");
    expect(err.message).toBe("bad shape");
  });

  it("is an instance of its own class and has a stack", () => {
    const err = new ParseError("x");
    expect(err).toBeInstanceOf(ParseError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(typeof err.stack).toBe("string");
    expect(String(err)).toBe("ParseError: x");
  });

  it("has no cause unless one is given", () => {
    expect(new ParseError("x").cause).toBeUndefined();
  });

  it("carries the cause passed via ErrorOptions", () => {
    const cause = new SyntaxError("boom");
    expect(new ParseError("x", { cause }).cause).toBe(cause);
  });
});

describe("ValidationError", () => {
  it("carries structured errors alongside the message", () => {
    const errors = [{ entryId: "entry.1", message: "required" }];
    const err = new ValidationError("validation failed", errors);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ValidationError");
    expect(err.errors).toBe(errors);
    expect(err.message).toBe("validation failed");
  });

  it("is an instance of its own class and not a ParseError", () => {
    const err = new ValidationError("v", []);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(ParseError);
    expect(err.errors).toEqual([]);
    expect(String(err)).toBe("ValidationError: v");
  });
});
