import { execFile, spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { expandHome } from "./configs";
import type { Prefs } from "./prefs";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 8 * 1024 * 1024;

type RunResult = { code: number; stdout: string; stderr: string };

class CommandMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandMissingError";
  }
}

/** Runs a program and keeps its exit code, so a non-zero exit is data, not an exception. */
export async function runFile(
  file: string,
  args: string[],
  options: { timeout?: number } = {},
): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      timeout: options.timeout ?? 30_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
    if (failure.code === "ENOENT") return { code: 127, stdout: "", stderr: `${file}: command not found` };
    if (typeof failure.code === "number") {
      return { code: failure.code, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
    }
    return { code: 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
  }
}

export function resolveBinary(prefs: Prefs): string {
  if (prefs.edgepadPath) {
    const configured = expandHome(prefs.edgepadPath);
    if (!existsSync(configured)) {
      throw new CommandMissingError(`edgepad was not found at ${configured}. Update "Edgepad Binary" in the extension preferences.`);
    }
    return configured;
  }
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "edgepad");
    try {
      if (existsSync(candidate)) {
        accessSync(candidate, constants.X_OK);
        return candidate;
      }
    } catch {
      // Not executable; keep looking.
    }
  }
  throw new CommandMissingError(
    "edgepad was not found on PATH. Install it, or set its path in the extension preferences.",
  );
}

export function edgepad(prefs: Prefs, args: string[], options: { timeout?: number } = {}): Promise<RunResult> {
  return runFile(resolveBinary(prefs), args, options);
}

/**
 * Starts a program and lets it go, for actions a gesture would run: the caller
 * must not wait for it, and its output does not belong in a toast.
 */
export function spawnDetached(argv: string[]): Promise<void> {
  const [file, ...args] = argv;
  if (!file) return Promise.reject(new Error("no command to run"));
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function systemctl(args: string[]): Promise<RunResult> {
  return runFile("systemctl", ["--user", ...args]);
}

/** The desktop systemd reported at session start; the wrapper selects its config from it. */
export async function currentDesktop(): Promise<string | undefined> {
  const env = await systemctl(["show-environment"]);
  if (env.code === 0) {
    for (const line of env.stdout.split("\n")) {
      if (line.startsWith("XDG_CURRENT_DESKTOP=")) return line.slice("XDG_CURRENT_DESKTOP=".length);
    }
  }
  return process.env.XDG_CURRENT_DESKTOP;
}

export function readConfigText(path: string): string {
  return readFileSync(path, "utf8");
}

function configDetail(statusOutput: string): string | undefined {
  for (const line of statusOutput.split("\n")) {
    const match = /^Config\s{2,}(.*)$/.exec(line);
    if (match) return match[1] ?? "";
  }
  return undefined;
}

/**
 * Writes the config only after edgepad itself has parsed it. The new text goes
 * to a sibling temp file, `edgepad status --config` validates that file, and
 * only then is it renamed over the real one; a rejected edit leaves the
 * original untouched and no half-written file behind.
 *
 * `status` also probes the device and the service, which can fail for reasons
 * that have nothing to do with the config, so only the Config line is read.
 */
export async function saveConfig(prefs: Prefs, path: string, text: string): Promise<void> {
  const dir = dirname(path);
  const tmp = join(dir, `.${basename(path)}.tmp-${process.pid}`);
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o644;
  writeFileSync(tmp, text, { mode });

  try {
    const result = await edgepad(prefs, ["status", "--config", tmp]);
    const detail = configDetail(result.stdout);
    if (!detail) {
      throw new Error(result.stderr.trim() || "edgepad status printed no Config line");
    }
    if (!detail.startsWith("/")) {
      throw new Error(detail);
    }
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // The temp file is already gone; the original is untouched either way.
    }
    throw error;
  }
}

/**
 * Saves, then asks the running service to reread its config. A service that is
 * not running is not an error: the file still applies the next time it starts.
 * The returned string is the note to put in the success toast, empty when the
 * reload went through.
 */
export async function applyConfig(prefs: Prefs, path: string, text: string): Promise<string> {
  await saveConfig(prefs, path, text);
  const active = await systemctl(["is-active", prefs.serviceName]);
  if (active.code !== 0) return "Service is not running; the change applies when it starts.";

  const reload = await systemctl(["reload", prefs.serviceName]);
  if (reload.code !== 0) {
    return `Saved, but the reload failed: ${reload.stderr.trim() || `exit ${reload.code}`}`;
  }
  return "";
}
