import { main } from "../main.js";

const offlineFetch: typeof fetch = () => {
  return Promise.reject(
    new Error("network access is not allowed in unit tests"),
  );
};

/** Runs the CLI in-process with captured output and an offline-by-default fetch. */
export const runMain = async (
  argv: string[],
  fetchImpl?: typeof fetch,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    fetch: fetchImpl ?? offlineFetch,
    stdout: (chunk) => {
      stdout += chunk;
    },
    stderr: (chunk) => {
      stderr += chunk;
    },
  });
  return { code, stdout, stderr };
};
