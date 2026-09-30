import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";

const MAX_BUFFER = 16 * 1024 * 1024;

export class BwCliNotFoundError extends Error {
  constructor(public readonly searchedPath: string) {
    super(
      `Bitwarden CLI not found. Install it with 'pacman -S bitwarden-cli' or set the CLI path in the extension preferences. Searched PATH: ${searchedPath}`,
    );
    this.name = "BwCliNotFoundError";
  }
}

/** Error carrying the CLI's stderr so callers can pattern-match on its wording. */
export class BwCliError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode?: number,
  ) {
    super(message);
    this.name = "BwCliError";
  }
}

/** Resolves the CLI: configured path first, otherwise the first `bw` on PATH. */
export function resolveCliPath(): string {
  const { cliPath } = getPreferenceValues<{ cliPath?: string }>();
  if (cliPath && cliPath.trim()) return cliPath.trim();

  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "bw");
    try {
      if (existsSync(candidate) && accessSync(candidate, constants.X_OK) === undefined) return candidate;
    } catch {
      // Not executable or unreadable; keep looking.
    }
  }

  throw new BwCliNotFoundError(process.env.PATH ?? "(unset)");
}

type RunOptions = {
  input?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  /** Non-zero exits are returned instead of thrown, for commands where that is normal. */
  allowFailure?: boolean;
};

type RunResult = { stdout: string; stderr: string };

/**
 * Runs the Bitwarden CLI and returns its stdout.
 *
 * A password is always passed through the environment rather than argv so it
 * never appears in the process list.
 */
export function runCli(args: string[], options: RunOptions = {}): Promise<string> {
  const { input, env, signal, allowFailure } = options;
  const cliPath = resolveCliPath();

  return new Promise<RunResult>((resolve, reject) => {
    const child = execFile(
      cliPath,
      args,
      {
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        signal,
        env: { ...process.env, ...env },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr });

        const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; code?: number | string };

        // A timed-out or user-cancelled run is not a CLI failure worth reporting.
        if (signal?.aborted || err.killed) return;

        if (err.code === "ENOENT") return reject(new BwCliNotFoundError(process.env.PATH ?? "(unset)"));

        const stderrText = typeof err.stderr === "string" ? err.stderr : stderr ?? "";
        if (allowFailure) return resolve({ stdout, stderr: stderrText });

        const exitCode = typeof err.code === "number" ? err.code : undefined;
        reject(new BwCliError(stderrText.trim() || `bw ${args[0] ?? ""} failed: ${err.message}`, stderrText, exitCode));
      },
    );

    if (input !== undefined) {
      child.stdin?.end(input);
    } else {
      child.stdin?.end();
    }
  }).then(({ stdout }) => stdout);
}
