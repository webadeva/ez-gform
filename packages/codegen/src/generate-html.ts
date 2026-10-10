import { formUrls } from "@ez-gform/core";
import type { FormSchema, Question } from "@ez-gform/types";

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

// Placeholder fbzx for multi-page forms. The research doc (section 5) says
// Google expects fbzx echoed, which is unverified; core itself sends a random
// token when the schema has none, so any well-formed token is treated as
// acceptable. A real per-load token would be stale in generated code.
const PLACEHOLDER_FBZX = "-1000000000000000000";

const attr = (name: string, value: string): string => {
  return `${name}="${escapeHtml(value)}"`;
};

const renderChoiceInputs = (
  question: Question,
  inputType: "radio" | "checkbox",
  requiredAttr = "",
): string => {
  const options = question.options ?? [];
  const rows = options.map((option) => {
    if (option.isOther) {
      return [
        `<label><input type="${inputType}" ${attr("name", question.entryId)} value="__other_option__"${requiredAttr}> Other:</label>`,
        `<input type="text" ${attr("name", `${question.entryId}.other_option_response`)}>`,
      ].join("\n    ");
    }
    return `<label><input type="${inputType}" ${attr("name", question.entryId)} ${attr("value", option.value)}${requiredAttr}> ${escapeHtml(option.value)}</label>`;
  });
  return rows.join("\n    ");
};

const renderGrid = (question: Question, requiredAttr: string): string => {
  const inputType = question.type === "checkbox_grid" ? "checkbox" : "radio";
  const columns = question.options ?? [];
  const rows = (question.rows ?? [])
    .map((row) => {
      const cells = columns
        .map((col) => {
          return `<td><input type="${inputType}" ${attr("name", row.entryId)} ${attr("value", col.value)}${requiredAttr}></td>`;
        })
        .join("");
      return `  <tr><th>${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join("\n");
  return `<table>\n${rows}\n</table>`;
};

const renderQuestion = (question: Question): string => {
  const description = question.description
    ? `\n<p>${escapeHtml(question.description)}</p>`
    : "";
  const label = `<label>${escapeHtml(question.title)}${question.required ? " *" : ""}</label>${description}`;
  const requiredAttr = question.required ? " required" : "";

  switch (question.type) {
    case "short_answer":
      return `${label}\n<input type="text" ${attr("name", question.entryId)}${requiredAttr}>`;
    case "paragraph":
      return `${label}\n<textarea ${attr("name", question.entryId)}${requiredAttr}></textarea>`;
    case "multiple_choice":
      return `${label}\n${renderChoiceInputs(question, "radio", requiredAttr)}`;
    // Checkboxes and checkbox grids cannot express "at least one" natively
    // (`required` would force every box), so only the asterisk marks them.
    case "checkboxes":
      return `${label}\n${renderChoiceInputs(question, "checkbox")}`;
    case "dropdown": {
      // Required: a disabled, selected empty-value placeholder option makes the
      // select report valueMissing until a real option is picked (without it
      // the first choice is always submitted). Optional: a selected blank
      // option posts an empty value (which core never emits and Google
      // ignores) instead of the first choice; not disabled because jsdom still
      // serialises a disabled selected option.
      const blank = question.required
        ? ['  <option value="" disabled selected>Choose</option>']
        : ['  <option value="" selected></option>'];
      const options = [
        ...blank,
        ...(question.options ?? []).map((option) => {
          return `  <option ${attr("value", option.value)}>${escapeHtml(option.value)}</option>`;
        }),
      ].join("\n");
      return `${label}\n<select ${attr("name", question.entryId)}${requiredAttr}>\n${options}\n</select>`;
    }
    case "linear_scale": {
      const min = question.scale?.min ?? 1;
      const max = question.scale?.max ?? 5;
      const inputs: string[] = [];
      for (let value = min; value <= max; value++) {
        inputs.push(
          `<label><input type="radio" ${attr("name", question.entryId)} ${attr("value", String(value))}${requiredAttr}> ${value}</label>`,
        );
      }
      return `${label}\n${inputs.join("\n")}`;
    }
    case "grid":
    case "checkbox_grid":
      return `${label}\n${renderGrid(question, question.type === "grid" ? requiredAttr : "")}`;
    case "date": {
      const inputs: string[] = [];
      if (question.date?.includeYear !== false) {
        inputs.push(
          `<input type="number" ${attr("name", `${question.entryId}_year`)} placeholder="Year"${requiredAttr}>`,
        );
      }
      inputs.push(
        `<input type="number" ${attr("name", `${question.entryId}_month`)} placeholder="Month"${requiredAttr}>`,
      );
      inputs.push(
        `<input type="number" ${attr("name", `${question.entryId}_day`)} placeholder="Day"${requiredAttr}>`,
      );
      if (question.date?.includeTime) {
        inputs.push(
          `<input type="number" ${attr("name", `${question.entryId}_hour`)} placeholder="Hour"${requiredAttr}>`,
        );
        inputs.push(
          `<input type="number" ${attr("name", `${question.entryId}_minute`)} placeholder="Minute"${requiredAttr}>`,
        );
      }
      return `${label}\n${inputs.join("\n")}`;
    }
    case "time": {
      const inputs = [
        `<input type="number" ${attr("name", `${question.entryId}_hour`)} placeholder="Hour"${requiredAttr}>`,
        `<input type="number" ${attr("name", `${question.entryId}_minute`)} placeholder="Minute"${requiredAttr}>`,
      ];
      // Google only reads _second for a Duration question.
      if (question.time?.isDuration) {
        inputs.push(
          `<input type="number" ${attr("name", `${question.entryId}_second`)} placeholder="Second"${requiredAttr}>`,
        );
      }
      return `${label}\n${inputs.join("\n")}`;
    }
    case "file_upload":
      return `${label}\n<!-- file_upload is not supported by the Forms API without sign-in; no input rendered -->`;
    default:
      return label;
  }
};

/**
 * Emits a plain HTML `<form>` (no JS framework required) posting directly to
 * the form's `formResponse` endpoint, with `name` attributes following every
 * `entry.N`(`_year`/`_month`/`_day`/`_hour`/`_minute`, `__other_option__`,
 * `.other_option_response`) encoding rule in
 * `docs/research/google-forms-internals.md` §3.
 */
export const generateHtmlForm = (schema: FormSchema): string => {
  const { formResponse } = formUrls(schema.formId || "REPLACE_WITH_FORM_ID");
  const body = schema.questions.map(renderQuestion).join("\n\n");

  const hiddenFields: string[] = [];
  if (schema.multiPage) {
    const pageCount = Math.max(schema.sections.length, 1);
    const pageHistory = Array.from({ length: pageCount }, (_, i) => {
      return i;
    }).join(",");
    hiddenFields.push(
      `<input type="hidden" ${attr("name", "fbzx")} ${attr("value", PLACEHOLDER_FBZX)}>`,
      `<input type="hidden" ${attr("name", "pageHistory")} ${attr("value", pageHistory)}>`,
      `<input type="hidden" ${attr("name", "partialResponse")} ${attr("value", JSON.stringify([null, null, PLACEHOLDER_FBZX]))}>`,
    );
  }

  const formDescription = schema.description
    ? `<p>${escapeHtml(schema.description)}</p>\n`
    : "";

  return `<!-- ${escapeHtml(schema.title)} -->
<form action="${escapeHtml(formResponse)}" method="POST">
${hiddenFields.join("\n")}
${formDescription}${body}

<button type="submit">Submit</button>
</form>
`;
};
