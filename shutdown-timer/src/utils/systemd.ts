import type { PowerAction } from "./state";

export type UnitRole = "action" | "early" | "final";
export type Paths = { systemctl: string; notifySend: string };
export type ArmRequest = {
  id: number;
  action: PowerAction;
  secondsFromNow: number;
  dryRun: boolean;
  role: UnitRole;
  earlySeconds?: number;
  finalSeconds?: number;
};
export type ArmPlan = { binary: string; args: string[]; exec: string[] };

const UNIT_PREFIX = "vicinae-shutdown-timer";
const NOTIFY_APP = "Shutdown Timer";

export function unitStem(role: UnitRole, id: number): string {
  return role === "action" ? `${UNIT_PREFIX}-${id}` : `${UNIT_PREFIX}-${id}-${role}`;
}

export function armCommands(request: ArmRequest, paths: Paths): ArmPlan | null {
  const { id, action, secondsFromNow, dryRun, role } = request;
  const label = actionLabel(action);
  const note = dryRun ? " Dry run: nothing will be turned off." : "";

  let onActive: number;
  let exec: string[];
  if (role === "action") {
    onActive = secondsFromNow;
    exec = dryRun
      ? [paths.notifySend, "-a", NOTIFY_APP, `Dry run: ${label} would happen now`, `The timer fired, and it was a dry run.${note}`]
      : [paths.systemctl, action];
  } else {
    const warningSeconds = role === "early" ? request.earlySeconds : request.finalSeconds;
    if (warningSeconds === undefined || warningSeconds <= 0) return null;
    onActive = secondsFromNow - warningSeconds;
    // A warning in the past is not a warning; the caller asked for something unarmable.
    if (onActive <= 0) return null;
    exec = [
      paths.notifySend,
      "-a",
      NOTIFY_APP,
      ...(role === "final" ? ["-u", "critical"] : []),
      `${label} in ${humanize(secondsFromNow)}`,
      role === "early" ? `Early warning.${note}` : `Last warning.${note}`,
    ];
  }

  return {
    binary: "systemd-run",
    args: [
      "--user",
      `--unit=${unitStem(role, id)}`,
      `--on-active=${onActive}s`,
      // AccuracySec defaults to 1min of slack, which makes a countdown a lie.
      "--timer-property=AccuracySec=1s",
      "--collect",
    ],
    exec,
  };
}

export function cancelCommand(stems: string[], paths: Paths): { binary: string; args: string[] } {
  return {
    binary: paths.systemctl,
    args: [
      "--user",
      "stop",
      ...stems.map((stem) => `${stem}.timer`),
      ...stems.map((stem) => `${stem}.service`),
    ],
  };
}

/** Reads the unit column from the right: NEXT/LEFT/LEFT-shifted columns are multi-token. */
export function parseTimerUnits(output: string): string[] {
  const units: string[] = [];
  for (const line of output.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    const service = tokens[tokens.length - 1];
    const timer = tokens[tokens.length - 2];
    if (service?.endsWith(".service") !== true || timer?.endsWith(".timer") !== true) continue;
    const stem = timer.slice(0, -".timer".length);
    if (stem.startsWith(`${UNIT_PREFIX}-`)) units.push(stem);
  }
  return units;
}

export function parseActiveStates(output: string, units: string[]): Record<string, boolean> {
  const lines = output.split("\n");
  const states: Record<string, boolean> = {};
  units.forEach((unit, index) => {
    states[unit] = lines[index]?.trim() === "active";
  });
  return states;
}

export function parseCapability(output: string): { allowed: boolean; reason?: string } {
  const value = /^s\s+"([^"]*)"$/.exec(output.trim())?.[1];
  if (value === "yes") return { allowed: true };
  const reasons: Record<string, string> = {
    no: "logind refuses this action",
    na: "not available on this machine",
    challenge: "needs authentication this session cannot give",
    busy: "another action is in progress",
    concurrent: "another session is active",
  };
  if (value !== undefined && value in reasons) {
    return { allowed: false, reason: reasons[value] ?? "logind refuses this action" };
  }
  return { allowed: false, reason: "could not read what logind answered" };
}

/** A timer that disappeared: past its deadline it ran, before it somebody cancelled it. */
export function classifyDisappearance(dueEpochSec: number, nowEpochSec: number): "ran" | "cancelled" {
  return nowEpochSec >= dueEpochSec ? "ran" : "cancelled";
}

function actionLabel(action: PowerAction): string {
  return action === "poweroff" ? "Power off" : action === "reboot" ? "Reboot" : "Suspend";
}

function humanize(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} seconds`;
}
