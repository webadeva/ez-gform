import { parseFormHtml } from "@ez-gform/core";
import { describe, expect, it } from "vitest";
import {
  LIVE_FORM_ID,
  fetchLiveHtml,
  loadFixtureSchema,
  stableQuestions,
} from "../helpers/live.js";

describe("live form vs captured fixture", () => {
  it("parses the live viewform to the same stable shape as the fixture", async () => {
    const live = parseFormHtml(await fetchLiveHtml());
    const fixture = loadFixtureSchema();

    expect(live.formId).toBe(LIVE_FORM_ID);
    expect(live.questions).toHaveLength(fixture.questions.length);
    expect(stableQuestions(live)).toEqual(stableQuestions(fixture));
    expect(live.multiPage).toBe(fixture.multiPage);
    expect(typeof live.fbzx).toBe("string");
    expect(live.fbzx).not.toBe("");
  });
});
