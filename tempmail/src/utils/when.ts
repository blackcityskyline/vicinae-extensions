/**
 * Dates are formatted from their parts, never through `toLocaleString` and never
 * through a library: both of those follow the machine's locale, which turns
 * "10 Mar" into "3/10" and midnight into 12:00 AM. See the same note in
 * `shell-history/src/utils/time.ts` and `in-the-time-zone/src/utils/time.ts`.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local time, 24-hour, `10.03.2026 04:59`. */
export function absoluteTime(at: Date | number | string): string {
  const date = new Date(at);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "45s ago", "3m ago", "5h ago", "9d ago". */
export function relativeTime(at: Date | number | string, now: Date | number = Date.now()): string {
  const seconds = Math.floor((new Date(now).getTime() - new Date(at).getTime()) / 1000);

  // Clock skew between the server and this machine is normal, and "in 3m" is a
  // worse thing to read than "just now".
  if (seconds < 60) return "just now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  return `${Math.floor(seconds / DAY)}d ago`;
}

/** "10m", "1h", "1h 30m", "0m". Never negative. */
export function remainingTime(until: Date | number | string, now: Date | number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((new Date(until).getTime() - new Date(now).getTime()) / 60_000));

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Why a username cannot be used, or null when it can. Shown under the field. */
export function validUsername(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a username";
  if (/\s/.test(trimmed)) return "A username cannot contain spaces";
  if (trimmed.includes("@")) return "A username cannot contain @";
  return null;
}
