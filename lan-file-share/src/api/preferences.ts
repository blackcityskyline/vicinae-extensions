import { getPreferenceValues } from "@vicinae/api";
import os from "node:os";
import path from "node:path";
import { resolvePort } from "~/utils/port";

export type ResolvedPreferences = {
  port: number;
  /** Set when the configured port is unusable, so the panel can say why the default was used. */
  portProblem?: string;
  receiveDirectory: string;
};

const DEFAULT_RECEIVE_DIRECTORY = "~/Downloads";

function expandHome(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

export function resolvePreferences(): ResolvedPreferences {
  const raw = getPreferenceValues<Preferences>();
  const { port, problem } = resolvePort(raw.port);
  return {
    port,
    portProblem: problem,
    receiveDirectory: expandHome(raw.receiveDirectory ?? "") || expandHome(DEFAULT_RECEIVE_DIRECTORY),
  };
}
