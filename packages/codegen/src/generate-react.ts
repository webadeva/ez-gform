import type {
  FormSchema,
  GenerateReactOptions,
  Question,
  Section,
} from "@ez-gform/types";
import { toPascalCase } from "./names.js";

export type GenerateReactComponentOptions = GenerateReactOptions;

const JSX_TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "{": "&#123;",
  "}": "&#125;",
};

/** Escapes text so it's safe to drop directly into JSX element children. */
const jsxEscape = (value: string): string => {
  return value.replace(/[&<>{}]/g, (ch) => {
    return JSX_TEXT_ESCAPES[ch]!;
  });
};

const q = (value: string): string => {
  return JSON.stringify(value);
};

const renderShortText = (question: Question, multiline: boolean): string => {
  const tag = multiline ? "textarea" : "input";
  const typeAttr = multiline ? "" : ' type="text"';
  return `<${tag}${typeAttr} {...form.register(${q(question.entryId)})}${
    question.required ? " required" : ""
  } />`;
};

const renderRadioGroup = (question: Question): string => {
  const entryId = q(question.entryId);
  const options = (question.options ?? [])
    .map((option) => {
      if (option.isOther) {
        return `        <label>
          <input
            type="radio"
            name={form.register(${entryId}).name}
            checked={typeof form.values[${entryId}] === "object"}
            onChange={() => form.setValue(${entryId}, { other: "" })}
          />
          Other:
          <input
            type="text"
            onChange={(e) => form.setValue(${entryId}, { other: e.target.value })}
          />
        </label>`;
      }
      const value = q(option.value);
      return `        <label>
          <input
            type="radio"
            name={form.register(${entryId}).name}
            value={${value}}
            checked={form.register(${entryId}).value === ${value}}
            onChange={() => form.setValue(${entryId}, ${value})}
          />
          ${jsxEscape(option.value)}
        </label>`;
    })
    .join("\n");
  return `<div role="radiogroup">
${options}
      </div>`;
};

const renderSelect = (question: Question): string => {
  const options = (question.options ?? [])
    .map((option) => {
      return `          <option value={${q(option.value)}}>${jsxEscape(option.value)}</option>`;
    })
    .join("\n");
  return `<select {...form.register(${q(question.entryId)})}${
    question.required ? " required" : ""
  }>
          <option value="">Select…</option>
${options}
        </select>`;
};

const renderCheckboxGroup = (question: Question): string => {
  const entryId = q(question.entryId);
  const options = (question.options ?? [])
    .map((option) => {
      if (option.isOther) {
        return `        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              const current = form.values[${entryId}];
              const chosen = Array.isArray(current) ? current.filter((v) => typeof v === "string") : [];
              form.setValue(${entryId}, e.target.checked ? [...chosen, { other: "" }] : chosen);
            }}
          />
          Other:
          <input
            type="text"
            onChange={(e) => {
              const current = form.values[${entryId}];
              const chosen = Array.isArray(current) ? current.filter((v) => typeof v === "string") : [];
              form.setValue(${entryId}, [...chosen, { other: e.target.value }]);
            }}
          />
        </label>`;
      }
      const value = q(option.value);
      return `        <label>
          <input type="checkbox" {...form.registerCheckbox(${entryId}, ${value})} />
          ${jsxEscape(option.value)}
        </label>`;
    })
    .join("\n");
  return `<div>
${options}
      </div>`;
};

const renderLinearScale = (question: Question): string => {
  const entryId = q(question.entryId);
  const min = question.scale?.min ?? 1;
  const max = question.scale?.max ?? 5;
  const items: string[] = [];
  for (let value = min; value <= max; value++) {
    items.push(`        <label>
          <input
            type="radio"
            name={form.register(${entryId}).name}
            checked={form.register(${entryId}).value === ${q(String(value))}}
            onChange={() => form.setValue(${entryId}, ${value})}
          />
          ${value}
        </label>`);
  }
  const lowLabel = question.scale?.lowLabel;
  const highLabel = question.scale?.highLabel;
  return `<div role="radiogroup">
        ${lowLabel ? `<span>${jsxEscape(lowLabel)}</span>` : ""}
${items.join("\n")}
        ${highLabel ? `<span>${jsxEscape(highLabel)}</span>` : ""}
      </div>`;
};

const renderGrid = (question: Question): string => {
  const isCheckbox = question.type === "checkbox_grid";
  const columns = question.options ?? [];
  const headerCells = columns
    .map((col) => {
      return `<th key={${q(col.value)}}>${jsxEscape(col.value)}</th>`;
    })
    .join("\n              ");
  const rows = (question.rows ?? [])
    .map((row) => {
      const entryId = q(row.entryId);
      const cells = columns
        .map((col) => {
          const value = q(col.value);
          if (isCheckbox) {
            return `<td key={${value}}><input type="checkbox" {...form.registerCheckbox(${entryId}, ${value})} /></td>`;
          }
          return `<td key={${value}}>
                <input
                  type="radio"
                  name={form.register(${entryId}).name}
                  checked={form.register(${entryId}).value === ${value}}
                  onChange={() => form.setValue(${entryId}, ${value})}
                />
              </td>`;
        })
        .join("\n              ");
      return `          <tr>
            <th>${jsxEscape(row.label)}</th>
              ${cells}
          </tr>`;
    })
    .join("\n");
  return `<table>
        <thead>
          <tr>
            <th />
              ${headerCells}
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>`;
};

const renderDate = (question: Question): string => {
  const entryId = q(question.entryId);
  const includeYear = question.date?.includeYear ?? true;
  const includeTime = question.date?.includeTime ?? false;
  const required = question.required ? "true" : "false";
  const dateParts = includeYear ? "[year, month, day]" : "[, month, day]";
  const dateValue = includeYear ? "year, month, day" : "month, day";
  const isObject = `typeof current === "object" && current !== null && !Array.isArray(current)`;
  if (!includeTime) {
    return `<input
        type="date"
        required={${required}}
        onChange={(e) => {
          const ${dateParts} = e.target.value.split("-").map(Number);
          if (month === undefined || day === undefined) return;
          form.setValue(${entryId}, { ${dateValue} });
        }}
      />`;
  }
  const keepYear = includeYear ? "year: Number(current.year), " : "";
  return `<input
        type="date"
        required={${required}}
        onChange={(e) => {
          const ${dateParts} = e.target.value.split("-").map(Number);
          if (month === undefined || day === undefined) return;
          const current = form.values[${entryId}];
          const time = ${isObject} && "hour" in current && "minute" in current ? { hour: Number(current.hour), minute: Number(current.minute) } : {};
          form.setValue(${entryId}, { ${dateValue}, ...time });
        }}
      />
      <input
        type="time"
        required={${required}}
        onChange={(e) => {
          const [hour, minute] = e.target.value.split(":").map(Number);
          if (hour === undefined || minute === undefined) return;
          const current = form.values[${entryId}];
          const date = ${isObject} && "month" in current && "day" in current ? { ${keepYear}month: Number(current.month), day: Number(current.day) } : {};
          form.setValue(${entryId}, { ...date, hour, minute });
        }}
      />`;
};

const renderTime = (question: Question): string => {
  const entryId = q(question.entryId);
  return `<input
        type="time"
        required={${question.required ? "true" : "false"}}
        onChange={(e) => {
          const parts = e.target.value.split(":").map(Number);
          const [hour, minute] = parts;
          if (hour === undefined || minute === undefined) return;
          form.setValue(${entryId}, { hour, minute });
        }}
      />`;
};

const renderQuestion = (question: Question): string => {
  const label = `<label>${jsxEscape(question.title)}${
    question.required ? " *" : ""
  }</label>`;
  const description = question.description
    ? `\n      <p>${jsxEscape(question.description)}</p>`
    : "";

  let field: string;
  switch (question.type) {
    case "short_answer":
      field = renderShortText(question, false);
      break;
    case "paragraph":
      field = renderShortText(question, true);
      break;
    case "multiple_choice":
      field = renderRadioGroup(question);
      break;
    case "dropdown":
      field = renderSelect(question);
      break;
    case "checkboxes":
      field = renderCheckboxGroup(question);
      break;
    case "linear_scale":
      field = renderLinearScale(question);
      break;
    case "grid":
    case "checkbox_grid":
      field = renderGrid(question);
      break;
    case "date":
      field = renderDate(question);
      break;
    case "time":
      field = renderTime(question);
      break;
    case "file_upload":
      field = `<p>"${jsxEscape(question.title)}" is a file upload question and is not supported by Google Forms submission without sign-in.</p>`;
      break;
    default:
      field = `<input {...form.register(${q(question.entryId)})} />`;
  }

  return `    <div key={${q(question.id)}}>
      ${label}${description}
      ${field}
    </div>`;
};

const renderSection = (
  section: Section,
  questionsById: Map<string, Question>,
): string => {
  const heading = section.title
    ? `    <h2>${jsxEscape(section.title)}</h2>\n`
    : "";
  const description = section.description
    ? `    <p>${jsxEscape(section.description)}</p>\n`
    : "";
  const body = section.questionIds
    .map((id) => {
      return questionsById.get(id);
    })
    .filter((question): question is Question => {
      return question !== undefined;
    })
    .map(renderQuestion)
    .join("\n");
  return `${heading}${description}${body}`;
};

/**
 * Generates a paste-ready React component wired to `useGoogleForm` from
 * `@ez-gform/react`. Renders every supported question type; `file_upload`
 * questions render a disabled note instead of an input (the Forms API can't
 * accept file uploads without a signed-in session).
 */
export const generateReactComponent = (
  schema: FormSchema,
  options: GenerateReactComponentOptions = {},
): string => {
  const typescript = options.typescript ?? true;
  const name = options.name ?? `${toPascalCase(schema.title)}Form`;
  // fbzx is a per-request token; core generates a fresh one when it is absent.
  const embedded = { ...schema };
  delete embedded.fbzx;
  const schemaJson = JSON.stringify(embedded, null, 2);

  const questionsById = new Map(
    schema.questions.map((qn) => {
      return [qn.id, qn];
    }),
  );
  const body =
    schema.sections.length > 1 ||
    (schema.sections[0]?.title && schema.sections[0].title.length > 0)
      ? schema.sections
          .map((section) => {
            return renderSection(section, questionsById);
          })
          .join("\n")
      : schema.questions.map(renderQuestion).join("\n");

  const schemaDeclaration = typescript
    ? `${schemaJson} as const satisfies FormSchema`
    : schemaJson;
  const typeImport = typescript
    ? `import type { FormSchema } from "@ez-gform/react";\n`
    : "";

  return `${typeImport}import { useGoogleForm } from "@ez-gform/react";

const schema = ${schemaDeclaration};

export function ${name}() {
  const form = useGoogleForm({ formId: schema.formId, schema });

  return (
    <form
      onSubmit={form.submit}
    >
      <h1>${jsxEscape(schema.title)}</h1>
      ${schema.description ? `<p>${jsxEscape(schema.description)}</p>` : ""}
${body}

      <div>Status: {form.status}</div>
      {form.errors && form.errors.length > 0 && (
        <ul>
          {form.errors.map((error, index) => (
            <li key={index}>{error.message}</li>
          ))}
        </ul>
      )}

      <button type="submit" disabled={form.status === "submitting"}>
        Submit
      </button>
    </form>
  );
}
`;
};
