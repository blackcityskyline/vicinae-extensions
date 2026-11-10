import { environment } from "@vicinae/api";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SEED_SOURCES, type Source } from "../utils/music.ts";

export interface MusicState {
  /** Editable: seeded on the first run, afterwards whatever the user saved. */
  sources: Source[];
  /** Url of the chosen source; "" is silence, the default. */
  active: string;
  /** The running mpv, or null. Kept in its own file for the timer's shell. */
  pid: number | null;
}

function sourcesPath(): string {
  return join(environment.supportPath, "music.json");
}

function presetsPath(): string {
  return join(environment.supportPath, "presets.json");
}

/** The alarm script reads this one file, so the pid is not buried in JSON. */
export function musicPidPath(): string {
  return join(environment.supportPath, "music.pid");
}

export function readMusic(): MusicState {
  let sources = SEED_SOURCES;
  let active = "";
  try {
    const parsed = JSON.parse(readFileSync(sourcesPath(), "utf8")) as { sources?: unknown; active?: unknown };
    if (Array.isArray(parsed.sources)) {
      sources = parsed.sources.filter(
        (source): source is Source =>
          typeof source === "object" &&
          source !== null &&
          typeof (source as Source).name === "string" &&
          typeof (source as Source).url === "string",
      );
    }
    if (typeof parsed.active === "string") active = parsed.active;
  } catch {
    // First run, or a file somebody edited into nonsense: the seeds are a start.
  }
  if (!sources.some((source) => source.url === active)) active = "";

  let pid: number | null = null;
  try {
    const raw = Number.parseInt(readFileSync(musicPidPath(), "utf8"), 10);
    pid = Number.isFinite(raw) ? raw : null;
  } catch {
    pid = null;
  }
  return { sources, active, pid };
}

export function writeMusic(state: MusicState): void {
  mkdirSync(environment.supportPath, { recursive: true });
  writeFileSync(sourcesPath(), `${JSON.stringify({ sources: state.sources, active: state.active }, null, 2)}\n`);
  if (state.pid) writeFileSync(musicPidPath(), `${state.pid}\n`);
  else rmSync(musicPidPath(), { force: true });
}

/** Presets saved from the list, on top of the Timer Presets preference. */
export function readPresets(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(presetsPath(), "utf8")) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    // First run, or a file somebody edited into nonsense: the preference is still there.
  }
  return [];
}

export function writePresets(presets: string[]): void {
  mkdirSync(environment.supportPath, { recursive: true });
  writeFileSync(presetsPath(), `${JSON.stringify(presets, null, 2)}\n`);
}
