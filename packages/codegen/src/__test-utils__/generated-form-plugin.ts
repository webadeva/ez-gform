import type { Plugin } from "vitest/config";
import { generateReactComponent } from "../generate-react.js";
import { loadFixtureSchema } from "./fixtures.js";

const PREFIX = "virtual:generated-form/";
// No leading \0: Vite only runs the TSX transform on ids it does not treat as virtual.
const RESOLVED_PREFIX = "/virtual-generated-form/";

/**
 * Vite plugin that turns `virtual:generated-form/<fixture-slug>.tsx` into the
 * output of `generateReactComponent` for that fixture (component named
 * `GeneratedForm`, plus `fixtureSchema`). Virtual, so no generated file ever touches the disk.
 */
export const generatedFormPlugin = (): Plugin => {
  return {
    name: "ez-gform-generated-form",
    enforce: "pre",
    resolveId: (id) => {
      return id.startsWith(PREFIX)
        ? `${RESOLVED_PREFIX}${id.slice(PREFIX.length)}`
        : undefined;
    },
    load: (id) => {
      if (!id.startsWith(RESOLVED_PREFIX)) return undefined;
      const slug = id.slice(RESOLVED_PREFIX.length).replace(/\.tsx$/, "");
      // The fixture loader needs a node `file:` URL, which jsdom test files
      // do not have, so the schema is re-exported from here for the tests.
      const source = generateReactComponent(loadFixtureSchema(slug), {
        name: "GeneratedForm",
      });
      return `${source}\nexport const fixtureSchema = schema;\n`;
    },
  };
};
