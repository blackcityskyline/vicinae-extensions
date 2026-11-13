import { execFile } from "node:child_process";

import { parseTabs, type Tab } from "./tabs";

const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 4 * 1024 * 1024;

/** The configured binary does not exist, so brotab is not installed. */
export class BrotabNotFoundError extends Error {
  constructor(public readonly binary: string) {
    super(`brotab is not installed: ${binary} was not found`);
    this.name = "BrotabNotFoundError";
  }
}

/**
 * Runs brotab once and returns its stdout.
 *
 * There is no separate `brotab -h` health check: a missing binary already fails
 * with ENOENT, and a probe would add a whole Python start before `list` could
 * begin.
 */
function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout) => {
      if (!error) return resolve(stdout);

      const code = (error as NodeJS.ErrnoException).code;
      reject(code === "ENOENT" ? new BrotabNotFoundError(binary) : error);
    });
  });
}

export async function listTabs(binary: string): Promise<Tab[]> {
  return parseTabs(await run(binary, ["list"]));
}

export async function activateTab(binary: string, id: string): Promise<void> {
  await run(binary, ["activate", id, "--focused"]);
}

export async function closeTab(binary: string, id: string): Promise<void> {
  await run(binary, ["close", id]);
}

/** ws:// host and port brotab talks to, used only to explain a refused connection. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes("ECONNREFUSED")
    ? "brotab's mediator is not running. Start your browser so its brotab extension can connect."
    : message;
}
