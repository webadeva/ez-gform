import type { ValidationIssue } from "@ez-gform/types";

/** Thrown when `FB_PUBLIC_LOAD_DATA_` (or a caller-supplied value) doesn't match the expected shape. */
export class ParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParseError";
  }
}

/** Thrown-shaped, but returned (not thrown) by `validateValues`. */
export class ValidationError extends Error {
  errors: ValidationIssue[];

  constructor(message: string, errors: ValidationIssue[]) {
    super(message);
    this.name = "ValidationError";
    this.errors = errors;
  }
}
