import { submitForm } from "@ez-gform/core";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "../helpers/csv.js";
import {
  CLI_PATH,
  fetchLiveSchema,
  LIVE_FORM_ID,
  LIVE_FORM_URL,
  runCli,
  SHEET_CSV_URL,
  USER_AGENT,
} from "../helpers/live.js";
import { buildVariant } from "../helpers/submit-values.js";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 90_000;
const MARKER_COLUMN = "Short answer required";
const TIMESTAMP_FORMAT = /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/;

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const makeMarker = (label: string): string => {
  return `e2e-${label} ${new Date().toISOString()} ${randomUUID().slice(0, 8)}`;
};

/** Polls the response sheet CSV until a row whose marker column equals `marker` appears. */
const pollForRow = async (marker: string): Promise<Record<string, string>> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(`${SHEET_CSV_URL}&_=${Date.now()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    expect(res.status).toBe(200);
    const row = parseCsvRecords(await res.text()).find((record) => {
      return record[MARKER_COLUMN] === marker;
    });
    if (row) return row;
    if (Date.now() > deadline) {
      throw new Error(`No sheet row with marker "${marker}" after 90s`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

const expectRowMatches = (
  row: Record<string, string>,
  expected: Record<string, string>,
): void => {
  expect(row.Timestamp).toMatch(TIMESTAMP_FORMAT);
  // Every answerable column in the sheet is asserted, none left unchecked.
  const cells = Object.fromEntries(
    Object.entries(row).filter(([name]) => {
      return name !== "Timestamp";
    }),
  );
  expect(Object.keys(cells).sort()).toEqual(Object.keys(expected).sort());
  expect(cells).toEqual(expected);
};

describe("live submission, verified in the response sheet", () => {
  it("core submitForm (cors) lands every answer in the sheet", async () => {
    const schema = await fetchLiveSchema();
    const marker = makeMarker("core");
    const { values, expected } = buildVariant(schema, marker, "a");

    const result = await submitForm(LIVE_FORM_ID, values, {
      schema,
      mode: "cors",
    });
    expect(result).toEqual({ status: "ok", httpStatus: 200 });

    expectRowMatches(await pollForRow(marker), expected);
  });

  it("CLI `submit` lands every answer in the sheet", async () => {
    expect(existsSync(CLI_PATH)).toBe(true);
    const schema = await fetchLiveSchema();
    const marker = makeMarker("cli");
    const { values, expected } = buildVariant(schema, marker, "b");

    const result = await runCli([
      "submit",
      LIVE_FORM_URL,
      "--data",
      JSON.stringify(values),
    ]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      httpStatus: 200,
    });

    expectRowMatches(await pollForRow(marker), expected);
  });
});
