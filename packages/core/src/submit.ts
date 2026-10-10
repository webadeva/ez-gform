import type { FormSchema, FormValues } from "@ez-gform/types";
import { encodeValues } from "./encode.js";
import { formUrls, normalizeFormId } from "./url.js";

/** Builds a human-facing `/viewform?usp=pp_url&entry.N=...` prefill URL. */
export const buildPrefillUrl = (
  formId: string,
  values: FormValues,
  schema?: FormSchema,
): string => {
  const { viewform } = formUrls(formId);
  const params = encodeValues(values, schema);
  const url = new URL(viewform);
  url.searchParams.set("usp", "pp_url");
  for (const [key, value] of params) {
    url.searchParams.append(key, value);
  }
  return url.toString();
};

/**
 * A per-load anti-replay token Google embeds as a hidden `fbzx` input. When a
 * real one (captured from the page being submitted, via `schema.fbzx`) isn't
 * available, this generates a random negative ~19-digit-ish numeric string in
 * the same shape Google's own client-side JS produces, as a best-effort
 * fallback — it is not guaranteed to be accepted.
 */
const randomFbzx = (): string => {
  const digits = Array.from({ length: 19 }, () => {
    return Math.floor(Math.random() * 10);
  }).join("");
  return `-${digits}`;
};

/** Builds the full `application/x-www-form-urlencoded` body for a `formResponse` POST. */
export const buildSubmitBody = (
  formId: string,
  values: FormValues,
  schema?: FormSchema,
): URLSearchParams => {
  normalizeFormId(formId);
  const params = encodeValues(values, schema);

  if (schema?.multiPage) {
    const fbzx = schema.fbzx ?? randomFbzx();
    const pageCount = Math.max(schema.sections.length, 1);
    const pageHistory = Array.from({ length: pageCount }, (_, i) => {
      return i;
    }).join(",");
    params.set("fbzx", fbzx);
    params.set("pageHistory", pageHistory);
    params.set("partialResponse", JSON.stringify([null, null, fbzx]));
  }

  params.set("submit", "Submit");
  return params;
};

export type SubmitResult =
  | { status: "sent" }
  | { status: "ok"; httpStatus: number }
  | { status: "error"; error: unknown; httpStatus?: number };

export interface SubmitOptions {
  schema?: FormSchema;
  fetch?: typeof fetch;
  mode?: "no-cors" | "cors";
  signal?: AbortSignal;
}

/**
 * POSTs `application/x-www-form-urlencoded` to the form's `formResponse`
 * endpoint. Defaults to `mode: "no-cors"` (required for cross-origin browser
 * submission; the response is opaque, so success can only be reported as
 * "sent", never confirmed) — see `docs/research/google-forms-internals.md`
 * §6. Pass `mode: "cors"` from Node/CLI contexts where the response can
 * actually be read.
 */
export const submitForm = async (
  formId: string,
  values: FormValues,
  opts: SubmitOptions = {},
): Promise<SubmitResult> => {
  const doFetch = opts.fetch ?? fetch;
  const mode = opts.mode ?? "no-cors";

  try {
    const { formResponse } = formUrls(formId);
    const body = buildSubmitBody(formId, values, opts.schema);
    const response = await doFetch(formResponse, {
      method: "POST",
      mode,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: opts.signal,
    });

    if (mode === "no-cors") {
      return { status: "sent" };
    }

    if (response.ok) {
      return { status: "ok", httpStatus: response.status };
    }
    return {
      status: "error",
      error: new Error(`formResponse returned HTTP ${response.status}`),
      httpStatus: response.status,
    };
  } catch (error) {
    return { status: "error", error };
  }
};
