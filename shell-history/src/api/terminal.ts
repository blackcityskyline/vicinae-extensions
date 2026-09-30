import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { join } from "node:path";

import { invocation, TERMINAL_NAMES } from "~/utils/terminals";
import type { Shell } from "~/utils/history";

export type TerminalResult = { ok: true } | { ok: false; message: string };

function onPath(binary: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    try {
      if (existsSync(candidate) && accessSync(candidate, constants.X_OK) === undefined) return candidate;
    } catch {
      // Not executable or unreadable; keep looking.
    }
  }
  return null;
}

function locate(choice: string): { binary: string; terminal: string } | TerminalResult {
  if (choice !== "auto") {
    const binary = onPath(choice);
    if (binary) return { binary, terminal: choice };
    return { ok: false, message: `The ${choice} binary was not found on PATH. Pick another terminal in the settings.` };
  }

  // The freedesktop.org way, when the helper is installed.
  const xdg = onPath("xdg-terminal-exec");
  if (xdg) return { binary: xdg, terminal: "xdg-terminal-exec" };

  for (const name of TERMINAL_NAMES) {
    const binary = onPath(name);
    if (binary) return { binary, terminal: name };
  }
  return {
    ok: false,
    message: "No terminal emulator was found on PATH. Install one, or set it in the settings.",
  };
}

/**
 * Opens a terminal, runs the command in the shell it came from, and leaves an
 * interactive shell of that same shell behind so the output stays readable.
 *
 * Detached: the extension has nothing to wait for, and the terminal outlives the
 * worker that started it. Nothing here can be waited on, so failures are
 * reported by whether the binary could be found at all.
 */
export function runInTerminal(choice: string, shell: Shell, command: string): TerminalResult {
  const located = locate(choice);
  if ("ok" in located) return located;

  const shellBinary = onPath(shell) ?? "/bin/sh";
  const plan = invocation(located.terminal, located.binary, shellBinary, command);
  if (!plan.ok) return plan;

  try {
    const child = spawn(plan.argv[0] as string, plan.argv.slice(1), {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...plan.env },
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `${located.terminal} could not be started: ${(error as Error).message}` };
  }
}
