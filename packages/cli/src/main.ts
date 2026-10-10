import {
  generateHtmlForm,
  generateReactComponent,
  generateSchemaJson,
  generateTypes,
} from "@ez-gform/codegen";
import {
  formUrls,
  normalizeFormId,
  parseFormData,
  parseFormHtml,
  submitForm,
  validateValues,
} from "@ez-gform/core";
import type { FormSchema, FormValues } from "@ez-gform/types";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SIGN_IN_ERROR =
  "This form requires sign-in; ez-gform only works with forms that are public (Settings → Responses → 'Restrict to users in <org>' off)";

const USAGE = `Usage:
  ez-gform [<form-url-or-id>] [--format json|types|react|html] [--name MyForm] [--out <file>] [--json-input <file>] [--timeout <ms>]
  ez-gform submit <form-url-or-id> --data '<json>' | --data @<file> [--json-input <file>] [--timeout <ms>]
  ez-gform --help
  ez-gform --version

Options:
  --format <json|types|react|html>  Output format. Defaults to "json".
  --name <Name>                     Base name used for generated types/component (types/react formats).
  --out <file>                      Write output to a file instead of stdout.
  --json-input <file>               Use a saved FB_PUBLIC_LOAD_DATA_ JSON or viewform HTML file instead of fetching.
                                    <form-url-or-id> is optional when --json-input is given (generate).
  --timeout <ms>                    Abort the form fetch after this many milliseconds. Defaults to 15000.
  --data <json|@file>               (submit) Values to submit, as inline JSON or "@path/to/file.json".
  --help                            Show this help.
  --version                         Show the CLI version.
`;

export interface CliDeps {
  fetch: typeof fetch;
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

class UsageError extends Error {}
class FetchOrParseError extends Error {}

const DEFAULT_TIMEOUT_MS = 15000;

/** Returns the timeout in ms, or undefined when `raw` is not a positive integer string. */
const parseTimeout = (raw: string | undefined): number | undefined => {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
};

const invalidTimeout = (raw: string | undefined): string => {
  return `Invalid --timeout "${raw}" (expected a positive integer of milliseconds)\n\n${USAGE}`;
};

const readOwnVersion = async (): Promise<string> => {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const raw = await readFile(fileURLToPath(pkgUrl), "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? "0.0.0";
};

const readDataOption = async (data: string): Promise<FormValues> => {
  const raw = data.startsWith("@")
    ? await readFile(data.slice(1), "utf8")
    : data;
  return JSON.parse(raw) as FormValues;
};

/** Loads a schema from `--json-input` (FB_PUBLIC_LOAD_DATA_ JSON array, or full viewform HTML). */
const loadSchemaFromFile = async (path: string): Promise<FormSchema> => {
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return parseFormData(JSON.parse(trimmed));
  }
  return parseFormHtml(raw);
};

/** Fetches a public form's `/viewform` HTML and parses it into a `FormSchema`. */
const fetchSchema = async (
  formIdOrUrl: string,
  deps: CliDeps,
  timeoutMs: number,
): Promise<FormSchema> => {
  const formId = normalizeFormId(formIdOrUrl);
  const { viewform } = formUrls(formId);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const fetchFailure = (cause: unknown): FetchOrParseError => {
    const reason = timedOut
      ? `timed out after ${timeoutMs} ms`
      : cause instanceof Error
        ? cause.message
        : String(cause);
    return new FetchOrParseError(`Failed to fetch "${viewform}": ${reason}`);
  };

  let html: string;
  try {
    let response: Response;
    try {
      response = await deps.fetch(viewform, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
    } catch (cause) {
      throw fetchFailure(cause);
    }

    if (
      response.status === 401 ||
      response.url.includes("accounts.google.com")
    ) {
      throw new FetchOrParseError(SIGN_IN_ERROR);
    }

    if (!response.ok) {
      throw new FetchOrParseError(
        `Failed to fetch "${viewform}": HTTP ${response.status}`,
      );
    }

    try {
      html = await response.text();
    } catch (cause) {
      throw fetchFailure(cause);
    }
  } finally {
    clearTimeout(timer);
  }
  try {
    return parseFormHtml(html);
  } catch (cause) {
    throw new FetchOrParseError(
      `Failed to parse form HTML: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
};

const renderFormat = (
  format: string,
  schema: FormSchema,
  name: string | undefined,
): string => {
  switch (format) {
    case "json":
      return generateSchemaJson(schema, { pretty: true });
    case "types":
      return generateTypes(schema, { name });
    case "react":
      return generateReactComponent(schema, { name });
    case "html":
      return generateHtmlForm(schema);
    default:
      throw new UsageError(
        `Unknown --format "${format}" (expected one of: json, types, react, html)`,
      );
  }
};

const runGenerate = async (argv: string[], deps: CliDeps): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "json" },
      name: { type: "string" },
      out: { type: "string" },
      "json-input": { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    deps.stdout(USAGE);
    return 0;
  }
  if (values.version) {
    deps.stdout(`${await readOwnVersion()}\n`);
    return 0;
  }

  const [formArg] = positionals;
  const jsonInput = values["json-input"];
  if (!formArg && !jsonInput) {
    deps.stderr(`Missing <form-url-or-id>.\n\n${USAGE}`);
    return 1;
  }

  const timeoutMs = parseTimeout(values.timeout);
  if (timeoutMs === undefined) {
    deps.stderr(invalidTimeout(values.timeout));
    return 1;
  }

  let schema: FormSchema;
  try {
    schema = jsonInput
      ? await loadSchemaFromFile(jsonInput)
      : await fetchSchema(formArg ?? "", deps, timeoutMs);
  } catch (error) {
    if (error instanceof FetchOrParseError) {
      deps.stderr(`${error.message}\n`);
      return 2;
    }
    deps.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let output: string;
  try {
    output = renderFormat(values.format, schema, values.name);
  } catch (error) {
    if (error instanceof UsageError) {
      deps.stderr(`${error.message}\n\n${USAGE}`);
      return 1;
    }
    throw error;
  }

  if (values.out) {
    await writeFile(values.out, output, "utf8");
  } else {
    deps.stdout(output.endsWith("\n") ? output : `${output}\n`);
  }
  return 0;
};

const runSubmit = async (argv: string[], deps: CliDeps): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      data: { type: "string" },
      "json-input": { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    deps.stdout(USAGE);
    return 0;
  }

  const [formArg] = positionals;
  if (!formArg || !values.data) {
    deps.stderr(
      `Usage: ez-gform submit <form-url-or-id> --data '<json>' | --data @<file>\n`,
    );
    return 1;
  }

  const timeoutMs = parseTimeout(values.timeout);
  if (timeoutMs === undefined) {
    deps.stderr(invalidTimeout(values.timeout));
    return 1;
  }

  let schema: FormSchema;
  try {
    schema = values["json-input"]
      ? await loadSchemaFromFile(values["json-input"])
      : await fetchSchema(formArg, deps, timeoutMs);
  } catch (error) {
    if (error instanceof FetchOrParseError) {
      deps.stderr(`${error.message}\n`);
      return 2;
    }
    throw error;
  }

  let data: FormValues;
  try {
    data = await readDataOption(values.data);
  } catch (error) {
    deps.stderr(
      `Failed to read --data: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  const validation = validateValues(data, schema);
  if (!validation.ok) {
    deps.stderr(
      `Validation failed:\n${validation.errors
        .map((e) => {
          return `  - ${e.entryId}: ${e.message}`;
        })
        .join("\n")}\n`,
    );
    return 2;
  }

  const formId = normalizeFormId(formArg);
  const result = await submitForm(formId, data, {
    schema,
    mode: "cors",
    fetch: deps.fetch,
  });
  deps.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "error" ? 2 : 0;
};

export const main = async (
  argv: string[],
  partial: Partial<CliDeps> = {},
): Promise<number> => {
  const deps: CliDeps = {
    fetch:
      partial.fetch ??
      ((input, init) => {
        return fetch(input, init);
      }),
    stdout:
      partial.stdout ??
      ((chunk) => {
        process.stdout.write(chunk);
      }),
    stderr:
      partial.stderr ??
      ((chunk) => {
        process.stderr.write(chunk);
      }),
  };

  if (argv[0] === "--help" || argv[0] === "-h") {
    deps.stdout(USAGE);
    return 0;
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    deps.stdout(`${await readOwnVersion()}\n`);
    return 0;
  }

  return argv[0] === "submit"
    ? runSubmit(argv.slice(1), deps)
    : runGenerate(argv, deps);
};
