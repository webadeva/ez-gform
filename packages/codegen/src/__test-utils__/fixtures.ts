import { parseFormData } from "@ez-gform/core";
import type { FormSchema } from "@ez-gform/types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolved from cwd (vitest runs in packages/codegen): under jsdom
// import.meta.url is not a file: URL, so fileURLToPath would throw.
const fixturesDir = resolve(process.cwd(), "../core/src/__fixtures__");

export const FIXTURE_SLUGS = ["all-question-types", "file-upload"] as const;

/**
 * Derived slug: the all-question-types fixture reduced to its duration
 * question, made required, so tests can submit and validate it alone.
 */
const REQUIRED_DURATION_SLUG = "required-duration";

export const loadFixtureSchema = (slug: string): FormSchema => {
  if (slug === REQUIRED_DURATION_SLUG) {
    const base = loadFixtureSchema("all-question-types");
    return {
      ...base,
      questions: base.questions
        .filter((question) => {
          return question.time?.isDuration === true;
        })
        .map((question) => {
          return { ...question, required: true };
        }),
    };
  }
  const raw = JSON.parse(
    readFileSync(resolve(fixturesDir, `${slug}.json`), "utf8"),
  ) as unknown;
  return parseFormData(raw, { formId: slug });
};
