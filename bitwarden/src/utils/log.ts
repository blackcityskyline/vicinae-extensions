import { environment } from "@vicinae/api";
import { getErrorString } from "~/utils/errors";

type Log = { message: string; error: unknown; at: Date };

const logs: Log[] = [];

/** Keeps the last few failures so they can be surfaced in an error screen. */
export const capturedExceptions = Object.freeze({
  push(message: string, error: unknown) {
    logs.push({ message, error, at: new Date() });
    // Only the most recent failures are useful; older ones just add noise.
    if (logs.length > 50) logs.shift();
  },
  clear: () => {
    logs.length = 0;
  },
  toString: () =>
    logs
      .map(({ at, message, error }) => {
        const detail = getErrorString(error);
        return `[${at.toISOString()}] ${message}${detail ? `: ${detail}` : ""}`;
      })
      .join("\n\n"),
});

/**
 * Records a non-fatal failure.
 *
 * Vicinae has no equivalent of Raycast's `captureException`, so this logs to the
 * extension's console (visible with `vici develop`) and keeps the message in a
 * small ring buffer for the troubleshooting screen.
 */
export function captureException(description: string | Falsy | (string | Falsy)[], error: unknown) {
  const text = Array.isArray(description) ? description.filter(Boolean).join(" ") : description;
  const message = text || "Captured exception";

  capturedExceptions.push(message, error);
  if (environment.isDevelopment) console.error(message, error);
}

export function debugLog(...args: unknown[]) {
  if (!environment.isDevelopment) return;
  console.debug(...args);
}
