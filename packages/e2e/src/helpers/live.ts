import { parseFormData, parseFormHtml } from "@ez-gform/core";
import type { FormSchema, Question } from "@ez-gform/types";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(
  new URL("../../../../", import.meta.url),
);

export const LIVE_FORM_ID =
  "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw";
export const LIVE_FORM_URL = `https://docs.google.com/forms/d/e/${LIVE_FORM_ID}/viewform`;
export const SIGNIN_FORM_ID =
  "1FAIpQLSfREd_C7AwV7IR5sGJjSXoleJi-zXtaSFVPPLyI8hqOb0ILhA";
export const SIGNIN_FORM_URL = `https://docs.google.com/forms/d/e/${SIGNIN_FORM_ID}/viewform`;
export const BOGUS_FORM_ID =
  "1FAIpQLSfdoesnotexist0000000000000000000000000000000000";
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1r5orG3sGssQSuYg2w-NeNa3sdHxiM_4jrw2hO5rruMQ/export?format=csv";
export const USER_AGENT = "Mozilla/5.0";

export const FIXTURE_JSON_PATH = `${REPO_ROOT}packages/core/src/__fixtures__/all-question-types.json`;
export const CLI_PATH = `${REPO_ROOT}packages/cli/dist/cli.js`;

export const fetchLiveHtml = async (): Promise<string> => {
  const res = await fetch(LIVE_FORM_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (res.status !== 200) {
    throw new Error(`GET ${LIVE_FORM_URL} returned HTTP ${res.status}`);
  }
  return res.text();
};

export const fetchLiveSchema = async (): Promise<FormSchema> => {
  return parseFormHtml(await fetchLiveHtml());
};

export const loadFixtureSchema = (): FormSchema => {
  return parseFormData(
    JSON.parse(readFileSync(FIXTURE_JSON_PATH, "utf8")) as unknown,
  );
};

/** Questions minus free-text fields that may be edited (title, description). */
export const stableQuestions = (
  schema: FormSchema,
): Omit<Question, "title" | "description">[] => {
  return schema.questions.map((question) => {
    const stable: Partial<Question> = { ...question };
    delete stable.title;
    delete stable.description;
    return stable as Omit<Question, "title" | "description">;
  });
};

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export const runCli = (
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<CliResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: opts.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      return (stdout += d.toString());
    });
    child.stderr.on("data", (d: Buffer) => {
      return (stderr += d.toString());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      return resolve({ code, stdout, stderr });
    });
    child.stdin.end(opts.input ?? "");
  });
};

export const getFreePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => {
        return resolve(port);
      });
    });
  });
};
