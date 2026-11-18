import { environment } from "@raycast/api";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SESSIONS, parseSessions, serializeSessions, type SessionDef } from "./sessions";

export type SessionMode = "default" | "custom";

/** Where the custom list lives; the file is created from the defaults the first time custom mode runs. */
export function sessionsFile(): string {
  return path.join(environment.supportPath, "market-sessions.json");
}

export type LoadedSessions = { sessions: SessionDef[] } | { error: string };

/** The sessions to draw. A custom file that cannot be read or parsed is an error, not a silent fall back to the defaults. */
export function loadSessions(mode: SessionMode): LoadedSessions {
  if (mode === "default") return { sessions: DEFAULT_SESSIONS };
  const file = sessionsFile();
  try {
    if (!existsSync(file)) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, serializeSessions(DEFAULT_SESSIONS), "utf8");
    }
    return parseSessions(readFileSync(file, "utf8"));
  } catch (e) {
    return { error: `Could not read ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
