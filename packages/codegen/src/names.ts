/** Splits a free-form string (a form title, question label, etc.) into word tokens. */
const splitWords = (input: string): string[] => {
  return (
    input
      // Insert boundaries between camelCase / acronym transitions.
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      // Replace anything that isn't a letter/digit with a space.
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((word) => {
        return word.length > 0;
      })
  );
};

/** Converts a free-form string into `PascalCase`, safe for a TS identifier/type name. */
export const toPascalCase = (input: string): string => {
  const words = splitWords(input);
  const pascal = words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
  if (pascal.length === 0) return "Form";
  return /^[0-9]/.test(pascal) ? `_${pascal}` : pascal;
};

/**
 * JS/TS reserved words (keywords, future reserved words, and strict-mode
 * reserved words) that are not valid as a binding identifier. Guarded here
 * because `toIdentifier` output is emitted as a real variable/prop name in
 * generated code.
 */
const RESERVED_WORDS = new Set([
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
  "eval",
  "arguments",
]);

/**
 * Converts a free-form string into a valid, sanitized JS identifier
 * (`camelCase`, no leading digit, and no collision with a JS/TS reserved
 * word — a trailing underscore is appended in that case).
 */
export const toIdentifier = (input: string): string => {
  const words = splitWords(input);
  if (words.length === 0) return "Form";
  const [first, ...rest] = words;
  const camel =
    first!.toLowerCase() +
    rest
      .map((word) => {
        const lower = word.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
  const prefixed = /^[0-9]/.test(camel) ? `_${camel}` : camel;
  return RESERVED_WORDS.has(prefixed) ? `${prefixed}_` : prefixed;
};
