import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The `brotab-ng` CLI reads what the browser keeps in files — history,
 * bookmarks, closed tabs, notes — and asks the add-on for what only the browser
 * can do: screenshots, history deletion, cookies and cache. None of that is on
 * the mediator's HTTP interface, so this extension shells out to it and reads
 * the one JSON object every command prints with `--json`.
 *
 * Nothing here imports `@vicinae/api`, so the call and its error handling are
 * tested headless.
 */

export type HistoryHit = {
  url: string;
  title: string;
  /** Last visit, milliseconds since the epoch. */
  lastVisit: number;
  visits: number;
};

export type ClosedTab = {
  /** Milliseconds since the epoch. */
  closedAt: number;
  title: string;
  url: string;
};

export type Bookmark = {
  title: string;
  url: string;
  /** `Bookmarks Toolbar/Dev`; empty at the root. */
  folder: string;
  /** Milliseconds since the epoch. */
  addedAt: number;
};

export type Note = {
  url: string;
  body: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
};

export type Screenshot = {
  /** The PNG the CLI wrote, in its cache directory. */
  file: string;
  tab: number;
  window: number;
  bytes: number;
};

/** Node's start plus a page's screenshot; the slowest command captures a tab. */
const TIMEOUT_MS = 20_000;
/** Large lists and a page's whole text can be big, and both arrive in one piece. */
const MAX_BUFFER = 32 * 1024 * 1024;

export class CliNotFoundError extends Error {
  constructor(public readonly binary: string) {
    super(
      `brotab-ng was not found at "${binary}". Install it (npm link in its repository) or set the Brotab NG Binary preference.`,
    );
    this.name = "CliNotFoundError";
  }
}

export class CliError extends Error {
  constructor(
    public readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** Runs `brotab-ng <args> --json` and parses its one JSON object. */
export function run<T>(binary: string, args: string[]): Promise<T> {  return new Promise<T>((resolve, reject) => {
    execFile(binary, [...args, "--json"], { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error !== null) {
        if (error.code === "ENOENT") return reject(new CliNotFoundError(binary));
        // The CLI prints its own message on stderr; the exit code carries the rest.
        return reject(new CliError(args[0] ?? "", stderr.trim() || error.message));
      }

      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        reject(new CliError(args[0] ?? "", `expected JSON on stdout, got ${JSON.stringify(stdout.slice(0, 80))}`));
      }
    });
  });
}

/** Whether a failure is worth explaining at all, or just the toast's message. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Which binary to run. Vicinae's server does not always inherit a session's
 * PATH — measured: `brotab-ng` on `~/.local/bin` was not found from the launcher
 * while the shell had it — so after an empty preference the usual install
 * locations are checked before falling back to a bare name.
 */
export function resolveBinary(preference: string | undefined, home = process.env.HOME ?? ""): string {
  const chosen = preference?.trim();
  if (chosen) return chosen;

  const candidates = [
    join(home, ".local", "bin", "brotab-ng"),
    "/usr/local/bin/brotab-ng",
    "/usr/bin/brotab-ng",
  ];
  return candidates.find((file) => existsSync(file)) ?? "brotab-ng";
}
