import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The unit doris itself starts when its TorrServer switch is turned on
 * (`src/app/settings.rs` in the doris repository). Measured on this machine:
 * `/usr/lib/systemd/system/torrserver.service`.
 */
export const SERVICE_UNIT = "torrserver.service";

/** `stop` is a different kind of act from `start`: it cuts running streams. */
export type ServiceAction = "start" | "stop" | "restart";

/** systemd allows the unit 30 s to come up or go down; give it that and a bit. */
const TIMEOUT_MS = 40_000;

/**
 * `sudo -n`, because Vicinae has no terminal and no polkit agent: a prompt
 * would wait forever. Measured: a plain `systemctl start torrserver.service`
 * from a session without an agent fails with "Connection timed out", while
 * `sudo -n systemctl …` succeeds when sudo is passwordless.
 */
export function serviceArgs(action: ServiceAction): string[] {
  return ["-n", "systemctl", action, SERVICE_UNIT];
}

/**
 * The CLI's own words, plus what to do about the one refusal that is about the
 * machine rather than the unit: sudo wants a password nobody can type here.
 */
export function serviceFailure(
  action: ServiceAction,
  stderr: string,
  exitCode: number,
): string {
  const line = stderr
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (line && /password is required|no tty present|not in the sudoers/i.test(line)) {
    return `${line}\n\nRun \`sudo systemctl ${action} ${SERVICE_UNIT}\` in a terminal, or let this user run systemctl without a password.`;
  }
  return line || `sudo systemctl ${action} ${SERVICE_UNIT} exited ${exitCode}.`;
}

export async function runService(action: ServiceAction): Promise<void> {
  try {
    await execFileAsync("sudo", serviceArgs(action), {
      timeout: TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });
  } catch (caught) {
    const error = caught as Error & {
      code?: string | number;
      killed?: boolean;
      stderr?: string;
    };
    if (error.code === "ENOENT") {
      throw new Error("sudo was not found, so the service cannot be touched here.");
    }
    if (error.killed) {
      throw new Error(
        `systemctl did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
      );
    }
    throw new Error(
      serviceFailure(
        action,
        error.stderr ?? "",
        typeof error.code === "number" ? error.code : 1,
      ),
    );
  }
}
