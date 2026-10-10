import type {
  FormSchema,
  GenerateTypesOptions,
  Question,
} from "@ez-gform/types";
import { toPascalCase } from "./names.js";

export type { GenerateTypesOptions } from "@ez-gform/types";

const quote = (value: string): string => {
  return JSON.stringify(value);
};

const hasOtherOption = (question: Question): boolean => {
  return (
    question.options?.some((option) => {
      return option.isOther;
    }) ?? false
  );
};

/** Returns the TS type text for a single question's value, or `undefined` to omit it entirely. */
const fieldType = (question: Question): string | undefined => {
  switch (question.type) {
    case "short_answer":
    case "paragraph":
      return "string";
    case "multiple_choice":
    case "dropdown":
      return hasOtherOption(question) ? "string | { other: string }" : "string";
    case "checkboxes":
      return hasOtherOption(question)
        ? "(string | { other: string })[]"
        : "string[]";
    case "linear_scale":
      return "number";
    case "date":
      return "DateValue";
    case "time":
      return "TimeValue";
    case "grid":
    case "checkbox_grid": {
      const rowIds = (question.rows ?? []).map((row) => {
        return quote(row.entryId);
      });
      const keyType = rowIds.length > 0 ? rowIds.join(" | ") : "string";
      return `Record<${keyType}, string | string[]>`;
    }
    case "file_upload":
      // File uploads can't be submitted through the Forms API without
      // sign-in; there is no meaningful value type for them.
      return undefined;
    default:
      return "string";
  }
};

/**
 * Emits `const <Name>Schema = {...} as const satisfies FormSchema;` and a
 * companion `type <Name>Values = { "entry.N"?: ...; ... }` mapping every
 * question's entry id to its precise `FieldValue` subtype.
 */
export const generateTypes = (
  schema: FormSchema,
  options: GenerateTypesOptions = {},
): string => {
  const name = options.name ?? toPascalCase(schema.title);
  // fbzx is a per-request token; core generates a fresh one when absent.
  const { fbzx: _, ...embeddedSchema } = schema;
  const schemaJson = JSON.stringify(embeddedSchema, null, 2);

  const usesDate = schema.questions.some((q) => {
    return q.type === "date";
  });
  const usesTime = schema.questions.some((q) => {
    return q.type === "time";
  });
  const extraTypeImports = [
    usesDate ? "DateValue" : undefined,
    usesTime ? "TimeValue" : undefined,
  ].filter((t): t is string => {
    return t !== undefined;
  });

  const fields: string[] = [];
  for (const question of schema.questions) {
    const type = fieldType(question);
    if (type === undefined) continue;
    const optional = question.required ? "" : "?";
    fields.push(`  ${quote(question.entryId)}${optional}: ${type};`);
  }

  const importLine = ["FormSchema", ...extraTypeImports].sort().join(", ");

  return `import type { ${importLine} } from "@ez-gform/core";

export const ${name}Schema = ${schemaJson} as const satisfies FormSchema;

export type ${name}Values = {
${fields.join("\n")}
};
`;
};
