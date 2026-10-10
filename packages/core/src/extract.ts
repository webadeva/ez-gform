import { ParseError } from "./errors.js";

const ASSIGNMENT_MARKER = "FB_PUBLIC_LOAD_DATA_";

/**
 * Finds `var FB_PUBLIC_LOAD_DATA_ = [ ... ];` in a Google Forms `/viewform`
 * page and `JSON.parse`s the array. The blob is JSON-compatible (no trailing
 * commas, no JS-only syntax) so once we've sliced out exactly the array
 * literal, a plain `JSON.parse` works.
 *
 * We deliberately don't regex the whole array (it can contain `;`, nested
 * `[`/`]`, and escaped strings) — instead we find the assignment, then find
 * the matching closing bracket by walking the string and tracking bracket
 * depth while respecting JSON string-escaping rules.
 */
export const extractPublicLoadData = (html: string): unknown => {
  const markerIndex = html.indexOf(ASSIGNMENT_MARKER);
  if (markerIndex === -1) {
    throw new ParseError(
      "extractPublicLoadData: FB_PUBLIC_LOAD_DATA_ not found in HTML",
    );
  }

  const equalsIndex = html.indexOf("=", markerIndex);
  if (equalsIndex === -1) {
    throw new ParseError(
      "extractPublicLoadData: malformed FB_PUBLIC_LOAD_DATA_ assignment",
    );
  }

  let start = equalsIndex + 1;
  while (start < html.length && /\s/.test(html[start]!)) {
    start++;
  }

  if (html[start] !== "[") {
    throw new ParseError(
      "extractPublicLoadData: expected array literal after FB_PUBLIC_LOAD_DATA_ =",
    );
  }

  const end = findMatchingBracketEnd(html, start);
  const literal = html.slice(start, end + 1);

  try {
    return JSON.parse(literal);
  } catch (cause) {
    // JSON.parse on a string only ever throws a SyntaxError, so no non-Error arm.
    throw new ParseError(
      `extractPublicLoadData: failed to JSON.parse the extracted FB_PUBLIC_LOAD_DATA_ literal: ${
        (cause as SyntaxError).message
      }`,
      { cause },
    );
  }
};

/** Walks from `startIndex` (the opening `[`) and returns the index of its matching `]`. */
const findMatchingBracketEnd = (text: string, startIndex: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  throw new ParseError(
    "extractPublicLoadData: unterminated array literal (no matching closing bracket)",
  );
};

/** Extracts the `fbzx` hidden-input value from a `/viewform` page, if present. */
export const extractFbzx = (html: string): string | undefined => {
  const match = /name="fbzx"\s+value="([^"]*)"/.exec(html);
  return match?.[1];
};
