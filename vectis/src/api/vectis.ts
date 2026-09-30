import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { join } from "node:path";

import {
  classifyFailure,
  gpuArgs,
  parseGpuDevices,
  parseStatus,
  profileArgs,
  tdpArgs,
} from "~/utils/vectis";
import type { DaemonStatus, Failure, GpuDevice, GpuModeValue, PowerProfileValue, TdpInput } from "~/utils/vectis";

/** Every call returns a result rather than throwing, so callers branch on the failure. */
export type VectisResult<T> = { ok: true; value: T } | { ok: false; failure: Failure };

export class VectisNotFound extends Error {
  constructor(readonly searchedPath: string) {
    super(
      "The vectis CLI was not found. Build vectis with 'cargo build --release --workspace' and " +
        `install target/release/vectis into /usr/local/bin, or set its path in the extension preferences. Searched PATH: ${searchedPath}`,
    );
    this.name = "VectisNotFound";
  }
}

function resolveCliPath(): string {
  const path = process.env.PATH ?? "";
  for (const dir of path.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "vectis");
    try {
      if (existsSync(candidate) && accessSync(candidate, constants.X_OK) === undefined) return candidate;
    } catch {
      // Not executable or unreadable; keep looking.
    }
  }
  throw new VectisNotFound(path || "(unset)");
}

type RunResult = { stdout: string; stderr: string; exitCode: number };

function run(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      resolveCliPath(),
      args,
      { maxBuffer: 4 * 1024 * 1024, encoding: "utf8", timeout: 20_000 },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr, exitCode: 0 });

        const err = error as NodeJS.ErrnoException & { code?: number | string };
        if (err.code === "ENOENT") return reject(new VectisNotFound(process.env.PATH ?? "(unset)"));

        const code = typeof err.code === "number" ? err.code : 1;
        resolve({ stdout, stderr: stderr || err.message, exitCode: code });
      },
    );
  });
}

/**
 * Runs a vectis subcommand and returns its stdout.
 *
 * A non-zero exit is vectisd speaking, so its stderr is classified rather than
 * replaced: the daemon's wording is what tells a stopped daemon from a PolicyKit
 * refusal from a machine with no RAPL zone.
 */
async function vectis<T>(args: string[] | null, parse: (stdout: string) => T | null): Promise<VectisResult<T>> {
  if (args === null) {
    return { ok: false, failure: { kind: "unknown", message: "That is not a setting vectisd has." } };
  }

  let result: RunResult;
  try {
    result = await run(args);
  } catch (error) {
    if (error instanceof VectisNotFound) throw error;
    return { ok: false, failure: classifyFailure((error as Error).message) };
  }

  if (result.exitCode !== 0) {
    return { ok: false, failure: classifyFailure(result.stderr) };
  }

  const value = parse(result.stdout);
  if (value === null) {
    return {
      ok: false,
      failure: { kind: "unknown", message: `Could not read the output of 'vectis ${args[0] ?? ""}'.` },
    };
  }
  return { ok: true, value };
}

export function getStatus(): Promise<VectisResult<DaemonStatus>> {
  return vectis(["status", "--json"], parseStatus);
}

export function listGpuDevices(): Promise<VectisResult<GpuDevice[]>> {
  // An empty list is a legitimate answer: a desktop with one GPU still reports
  // it, but parseGpuDevices returns [] for both "none" and unreadable output,
  // so an empty result here means there is nothing to show rather than a bug.
  return vectis(["gpu-list"], (stdout) => parseGpuDevices(stdout));
}

export function applyProfile(profile: PowerProfileValue): Promise<VectisResult<string>> {
  return vectis(profileArgs(profile), (stdout) => stdout.trim());
}

export function setGpuMode(
  mode: GpuModeValue,
  options: { force?: boolean; nouveau?: boolean } = {},
): Promise<VectisResult<string>> {
  return vectis(gpuArgs(mode, options), (stdout) => stdout.trim());
}

export function setTdp(input: TdpInput): Promise<VectisResult<string>> {
  return vectis(tdpArgs(input), (stdout) => stdout.trim());
}

export function clearTdp(): Promise<VectisResult<string>> {
  return vectis(["tdp-clear"], (stdout) => stdout.trim());
}

/**
 * Drops a queued GPU switch so it is not applied on the next logout.
 *
 * The daemon answers whether anything was actually queued, so the caller can
 * tell "cancelled" from "there was nothing to cancel" instead of always
 * claiming success.
 */
export async function clearGpuPending(): Promise<VectisResult<boolean>> {
  const result = await vectis(["gpu-cancel"], (stdout) => stdout.trim());
  if (!result.ok) return result;
  return { ok: true, value: /no GPU switch was queued/i.test(result.value) === false };
}