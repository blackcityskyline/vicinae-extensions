import { Cache, environment } from "@vicinae/api";
import { exec, execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { alertScript, systemdCommand } from "../utils/alert.ts";
import { formatDuration } from "../utils/parse.ts";
import { musicPidPath } from "./store.ts";

export interface Timer {
  id: string;
  /** "5:00", as the list shows it. */
  name: string;
  note: string;
  targetEpoch: number;
  unitName: string;
}

// The same key the forked extension used, so timers created before this build
// still show up.
const cache = new Cache();

export function readTimers(): Timer[] {
  const raw = cache.get("active_timers");
  if (!raw) return [];
  let all: Timer[];
  try {
    all = JSON.parse(raw) as Timer[];
  } catch {
    return [];
  }
  const live = all.filter((timer) => timer.targetEpoch > Date.now());
  if (live.length !== all.length) cache.set("active_timers", JSON.stringify(live));
  return live;
}

export function writeTimers(timers: Timer[]): void {
  cache.set("active_timers", JSON.stringify(timers));
}

export function soundFlagPath(): string {
  return join(environment.supportPath, "stop-sound");
}

/**
 * A transient systemd user timer: it belongs to the machine, not to this
 * window, so closing the launcher does not lose the deadline.
 */
export function scheduleTimer(seconds: number, note: string, repeat: boolean): Timer {
  const id = Date.now().toString();
  const unitName = `vicinae-timer-${id}`;
  const script = alertScript({
    note,
    sound: join(environment.assetsPath, "alarm-submarine.wav"),
    stopFlag: soundFlagPath(),
    musicPidFile: musicPidPath(),
    repeat,
  });
  mkdirSync(environment.supportPath, { recursive: true });
  // Synchronous on purpose: a rejection has to reach the list, not a toast
  // over a timer that will never fire.
  execSync(systemdCommand(seconds, unitName, script), { stdio: "ignore" });
  return {
    id,
    name: formatDuration(seconds),
    note,
    targetEpoch: Date.now() + seconds * 1000,
    unitName,
  };
}

export function stopTimer(timer: Timer): void {
  exec(`systemctl --user stop ${timer.unitName}.timer`);
}

/** The repeating alarm watches this file; see `alertScript`. */
export function stopSound(): void {
  mkdirSync(environment.supportPath, { recursive: true });
  writeFileSync(soundFlagPath(), "1");
}
