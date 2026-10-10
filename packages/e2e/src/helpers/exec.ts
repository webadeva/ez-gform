import { execFile } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** Runs a binary with explicit args and cwd (no shell); rejects on non-zero exit. */
export const run = (
  file: string,
  args: string[],
  cwd: string,
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${file} ${args.join(" ")} failed in ${cwd}: ${error.message}\n${stderr}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
};
