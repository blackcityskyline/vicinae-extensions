import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import type { Config } from "~/types";
import { buildConfig, parseAssignments } from "~/utils/config";

export function readConfig(): Config {
  // Vicinae's worker inherits the session environment, but HOME is too important
  // here to rely on that alone.
  const env = { ...process.env, HOME: process.env.HOME || homedir() };
  const configDir = buildConfig({}, env).configDir;

  let text = "";
  try {
    text = readFileSync(`${configDir}/config`, "utf8");
  } catch (error) {
    // yt-x creates this file on first run; until then its defaults apply.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return buildConfig(parseAssignments(text), env);
}
