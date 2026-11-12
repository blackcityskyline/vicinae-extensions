/**
 * XDG paths and the two display helpers, kept free of `@vicinae/api` so the
 * tests can import them.
 */

import os from "node:os";
import path from "node:path";

function xdg(variable: string, fallback: string): string {
  const value = process.env[variable];
  return value !== undefined && value !== "" ? value : path.join(os.homedir(), fallback);
}

export function configDir(): string {
  return path.join(xdg("XDG_CONFIG_HOME", ".config"), "nvim");
}

export function stateDir(): string {
  return path.join(xdg("XDG_STATE_HOME", ".local/state"), "nvim");
}

export function dataDir(): string {
  return path.join(xdg("XDG_DATA_HOME", ".local/share"), "nvim");
}

/** persistence.nvim's directory; the extension never writes here except to delete a stale session. */
export function sessionsDir(): string {
  return path.join(stateDir(), "sessions");
}

export function lazyLockPath(): string {
  return path.join(configDir(), "lazy-lock.json");
}

export function pluginRoot(): string {
  return path.join(dataDir(), "lazy");
}

/** `~` for display: a 60-character path does not fit a subtitle. */
export function shortHome(target: string): string {
  const home = os.homedir();
  if (target === home) return "~";
  return target.startsWith(`${home}/`) ? `~${target.slice(home.length)}` : target;
}

/** "just now", "3 hours ago", "12 days ago" — enough for a sorted list. */
export function ago(when: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - when.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format.format(-minutes, "minute");

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["hour", 3600],
    ["day", 86_400],
    ["month", 2_592_000],
    ["year", 31_536_000],
  ];

  const [unit, size] = units.reduce((best, next) => (seconds >= next[1] ? next : best));
  return format.format(-Math.round(seconds / size), unit);
}
