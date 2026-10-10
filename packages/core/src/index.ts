export const VERSION: string = __EZ_GFORM_VERSION__;

export { encodeValues, validateValues } from "./encode.js";
export { ParseError, ValidationError } from "./errors.js";
export { extractPublicLoadData } from "./extract.js";
export { parseFormData, parseFormHtml } from "./parse.js";
export { buildPrefillUrl, buildSubmitBody, submitForm } from "./submit.js";
export { formUrls, normalizeFormId } from "./url.js";

// Re-export the shared schema/value/submit types so existing consumers of
// `@ez-gform/core` keep working after they were extracted to
// `@ez-gform/types`.
export type * from "@ez-gform/types";
