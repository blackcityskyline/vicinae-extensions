import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DankSessionError,
  type RestorePlan,
  type ServiceState,
  type Snapshot,
  parseCapture,
  parseRestorePlan,
  parseServiceState,
  parseStatus,
} from "~/utils/state.ts";

const MAX_BUFFER = 8 * 1024 * 1024;
const SERVICE = "danksession.service";

export class DanksessionNotFoundError extends Error {
  constructor(public readonly searchedPath: string) {
    super(
      `danksession not found. Build it with 'go build ./cmd/danksession' or set the binary path in the extension preferences. Searched PATH: ${searchedPath}`,
    );
    this.name = "DanksessionNotFoundError";
  }
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

/**
 * Resolves the backend. Vicinae does not inherit a login shell's PATH, so
 * `~/.local/bin` — where the install docs put the binary — is checked too.
 */
export function resolveBinary(): string {
  const { danksessionPath } = getPreferenceValues<{ danksessionPath?: string }>();
  const configured = expandHome(danksessionPath?.trim() ?? "");
  if (configured) return configured;

  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "danksession"))) return join(dir, "danksession");
  }

  const installed = join(homedir(), ".local", "bin", "danksession");
  if (existsSync(installed)) return installed;

  throw new DanksessionNotFoundError(process.env.PATH ?? "(unset)");
}

function run(args: string[], timeoutMs: number): Promise<string> {
  const binary = resolveBinary();

  return new Promise<string>((resolve, reject) => {
    execFile(
      binary,
      args,
      { maxBuffer: MAX_BUFFER, encoding: "utf8", timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);

        const failure = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string };
        if (failure.code === "ENOENT") return reject(new DanksessionNotFoundError(binary));
        if (failure.killed) {
          return reject(new DankSessionError(`danksession ${args[0]} did not answer within ${Math.round(timeoutMs / 1000)} s.`));
        }

        // The backend reports failures as {"error": "..."} on stdout, even with
        // a non-zero exit, so the parser gets the first say.
        if (stdout.trim().startsWith("{")) return resolve(stdout);

        const detail = (stderr ?? "").trim();
        reject(
          new DankSessionError(
            detail || `danksession ${args.join(" ")} exited with code ${String(failure.code ?? failure.signal ?? "unknown")}.`,
          ),
        );
      },
    );
  });
}

/** Reads the saved snapshot summary; works even when Hyprland is unreachable. */
export async function readStatus(): Promise<Snapshot> {
  return parseStatus(await run(["status"], 15_000));
}

/** Writes a new snapshot and returns the number of windows it holds. */
export async function capture(): Promise<number> {
  return parseCapture(await run(["capture"], 30_000));
}

/** Preview only: prints what a restore would match, launch and move. */
export async function previewRestore(): Promise<RestorePlan> {
  return parseRestorePlan(await run(["restore", "--dry-run"], 30_000));
}

/** Restores placement and relaunches configured applications. */
export async function restore(): Promise<RestorePlan> {
  return parseRestorePlan(await run(["restore"], 60_000));
}

function systemctl(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "systemctl",
      ["--user", ...args],
      { maxBuffer: MAX_BUFFER, encoding: "utf8", timeout: 15_000 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);

        const failure = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string };
        if (failure.code === "ENOENT") {
          return reject(new DankSessionError("systemctl was not found, so the service cannot be managed from here."));
        }
        if (failure.killed) return reject(new DankSessionError("systemctl did not answer within 15 s."));

        const detail = (stderr ?? "").trim();
        reject(
          new DankSessionError(
            detail || `systemctl ${args.join(" ")} exited with code ${String(failure.code ?? failure.signal ?? "unknown")}.`,
          ),
        );
      },
    );
  });
}

/** `null` when systemd cannot be read; the layout still works then. */
export async function readService(): Promise<ServiceState | null> {
  try {
    return parseServiceState(
      await systemctl(["show", SERVICE, "--property=LoadState,UnitFileState,ActiveState", "--no-pager"]),
    );
  } catch {
    return null;
  }
}

export type ServiceAction = "start" | "stop" | "restart" | "enable" | "disable" | "enable-and-start";

/** The unit name is fixed: the extension and the backend ship as `danksession`. */
export async function manageService(action: ServiceAction): Promise<void> {
  await systemctl(action === "enable-and-start" ? ["enable", "--now", SERVICE] : [action, SERVICE]);
}
