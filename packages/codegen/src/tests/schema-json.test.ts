import { describe, expect, it } from "vitest";
import {
  FIXTURE_SLUGS,
  loadFixtureSchema,
} from "../__test-utils__/fixtures.js";
import { generateSchemaJson } from "../schema-json.js";

describe("generateSchemaJson", () => {
  for (const slug of FIXTURE_SLUGS) {
    it(`round-trips ${slug} through JSON.parse structurally`, () => {
      const schema = loadFixtureSchema(slug);
      const json = generateSchemaJson(schema);
      const parsed: unknown = JSON.parse(json);
      expect(parsed).toEqual(schema);
    });
  }

  it("pretty-prints by default", () => {
    const schema = loadFixtureSchema("all-question-types");
    const json = generateSchemaJson(schema);
    expect(json).toContain("\n");
  });

  it("can be minified", () => {
    const schema = loadFixtureSchema("all-question-types");
    const json = generateSchemaJson(schema, { pretty: false });
    expect(json).not.toContain("\n");
    expect(JSON.parse(json)).toEqual(schema);
  });

  it("indents with two spaces when pretty is true or omitted", () => {
    const schema = loadFixtureSchema("file-upload");
    const expected = JSON.stringify(schema, null, 2);
    expect(generateSchemaJson(schema)).toBe(expected);
    expect(generateSchemaJson(schema, {})).toBe(expected);
    expect(generateSchemaJson(schema, { pretty: true })).toBe(expected);
    expect(expected.split("\n")[1]).toMatch(/^ {2}"/);
  });

  it("emits compact output with no whitespace padding when pretty is false", () => {
    const schema = loadFixtureSchema("file-upload");
    expect(generateSchemaJson(schema, { pretty: false })).toBe(
      JSON.stringify(schema),
    );
  });

  it("keeps the schema's key order stable", () => {
    const schema = loadFixtureSchema("all-question-types");
    const parsed = JSON.parse(generateSchemaJson(schema)) as typeof schema;
    expect(Object.keys(parsed)).toEqual(Object.keys(schema));
    expect(Object.keys(parsed.questions[0]!)).toEqual(
      Object.keys(schema.questions[0]!),
    );
    expect(generateSchemaJson(schema)).toBe(generateSchemaJson(schema));
  });
});
