import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { PowerAction } from "~/utils/state";
import {
  armCommands,
  cancelCommand,
  parseActiveStates,
  parseCapability,
  parseTimerUnits,
  type ArmRequest,
  type Paths,
} from "~/utils/systemd";

const execFileAsync = promisify(execFile);
const RUN_TIMEOUT_MS = 10_000;

export type MaybeError<T> = { result: T; error?: undefined } | { result?: undefined; error: Error };

type RunResult = { stdout?: string; error?: Error };

type Tools = {
  systemctl: string;
  systemdRun: string;
  busctl: string;
  paths: Paths;
};

const CAPABILITY_METHOD: Record<PowerAction, string> = {
  poweroff: "CanPowerOff",
  reboot: "CanReboot",
  suspend: "CanSuspend",
};

function findOnPath(binary: string): string | undefined {
  for (const dir of process.env.PATH?.split(":") ?? []) {
    if (dir === "") continue;
    const candidate = join(dir, binary);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory; the next one may hold it.
    }
  }
  return undefined;
}

function resolveTools(): { tools?: Tools; error?: Error } {
  const names = ["systemctl", "systemd-run", "busctl", "notify-send"];
  const found = new Map(names.map((name) => [name, findOnPath(name)]));
  const missing = names.filter((name) => found.get(name) === undefined);
  if (missing.length > 0) {
    return {
      error: new Error(
        `${missing.join(", ")} not found on PATH — this extension drives systemd timers and needs systemd (plus libnotify for the warnings).`,
      ),
    };
  }
  const systemctl = found.get("systemctl")!;
  const notifySend = found.get("notify-send")!;
  return {
    tools: { systemctl, systemdRun: found.get("systemd-run")!, busctl: found.get("busctl")!, paths: { systemctl, notifySend } },
  };
}

/**
 * Runs a binary without a shell. A non-zero exit still carries the program's own
 * stdout (promisified execFile attaches it to the error), because `systemctl
 * is-active` answers in stdout and its exit code is not the answer (measured on
 * systemd 262).
 */
async function run(binary: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout } = await execFileAsync(binary, args, { timeout: RUN_TIMEOUT_MS, encoding: "utf8" });
    return { stdout: String(stdout) };
  } catch (raw) {
    const failure = raw as Partial<Error> & { stdout?: unknown; code?: unknown };
    const stdout = typeof failure.stdout === "string" ? failure.stdout : undefined;
    return { stdout, error: describeFailure(binary, failure) };
  }
}

function describeFailure(binary: string, failure: Partial<Error> & { code?: unknown }): Error {
  const detail = (failure as { stderr?: unknown }).stderr;
  const stderr = typeof detail === "string" ? detail.trim() : "";
  const exit = typeof failure.code === "number" ? ` (exit ${failure.code})` : "";
  if (stderr !== "") return new Error(`${binary}${exit}: ${stderr}`);
  if (typeof failure.code === "string") return new Error(`${binary} could not be started: ${failure.code}`);
  return new Error(`${binary} failed${exit}${failure.message === undefined ? "" : `: ${failure.message}`}`);
}

export async function capability(action: PowerAction): Promise<MaybeError<{ allowed: boolean; reason?: string }>> {
  const { tools, error } = resolveTools();
  if (tools === undefined) return { error: error ?? new Error("systemd is not available") };
  const answered = await run(tools.busctl, [
    "call",
    "org.freedesktop.login1",
    "/org/freedesktop/login1",
    "org.freedesktop.login1.Manager",
    CAPABILITY_METHOD[action],
  ]);
  if (answered.error !== undefined && answered.stdout === undefined) return { error: answered.error };
  return { result: parseCapability(answered.stdout ?? "") };
}

export async function armTimer(request: ArmRequest): Promise<MaybeError<void>> {
  const { tools, error } = resolveTools();
  if (tools === undefined) return { error: error ?? new Error("systemd is not available") };
  const plan = armCommands(request, tools.paths);
  if (plan === null) {
    return { error: new Error("that warning would land after the action — shorten the warning or arm further ahead") };
  }
  const attempt = await run(plan.binary, [...plan.args, ...plan.exec]);
  if (attempt.error !== undefined) return { error: attempt.error };
  return { result: undefined };
}

export async function liveTimers(): Promise<MaybeError<string[]>> {
  const { tools, error } = resolveTools();
  if (tools === undefined) return { error: error ?? new Error("systemd is not available") };
  const listing = await run(tools.systemctl, ["--user", "list-timers", "vicinae-shutdown-timer-*", "--no-pager"]);
  if (listing.error !== undefined && listing.stdout === undefined) return { error: listing.error };
  return { result: parseTimerUnits(listing.stdout ?? "") };
}

/** Stops the given timer stems and proves they are no longer active. */
export async function cancelTimers(stems: string[]): Promise<MaybeError<void>> {
  if (stems.length === 0) return { result: undefined };
  const { tools, error } = resolveTools();
  if (tools === undefined) return { error: error ?? new Error("systemd is not available") };

  const stop = cancelCommand(stems, tools.paths);
  const attempt = await run(stop.binary, stop.args);
  if (attempt.error !== undefined && attempt.stdout === undefined) return { error: attempt.error };

  const units = [...stems.map((stem) => `${stem}.timer`), ...stems.map((stem) => `${stem}.service`)];
  const check = await run(tools.systemctl, ["--user", "is-active", ...units]);
  if (check.error !== undefined && check.stdout === undefined) return { error: check.error };
  const states = parseActiveStates(check.stdout ?? "", units);
  const stillActive = units.filter((unit) => states[unit] === true);
  if (stillActive.length > 0) {
    return { error: new Error(`systemd did not stop: ${stillActive.join(", ")}`) };
  }
  return { result: undefined };
}
