/**
 * Everything here is pure: the torrent RPC answers bytes, seconds and a 0–6 status
 * code, and the list needs words. Nothing imports the API, so the tests run headless.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** `1536` → `1.5 KB`; whole numbers above 100 stay whole, the way a client reads. */
export function bytes(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "—";

  let value = count;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${text} ${UNITS[unit] ?? "B"}`;
}

/** `0` is not "0 B/s", it is "nothing is moving". */
export function speed(count: number): string {
  return count <= 0 ? "—" : `${bytes(count)}/s`;
}

/** Seconds left, at the precision a person needs: days, hours, minutes, seconds. */
export function eta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = Math.floor(seconds % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

/** `percentDone` arrives as a fraction, not a percentage. */
export function percent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

/** Upload ratio: the RPC sends -1 for "no download yet", which is not a ratio. */
export function ratio(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  return value.toFixed(2);
}

/** The RPC's torrent status codes, in its own order. */
const STATUS_LABELS = [
  "Stopped",
  "Queued to check",
  "Checking",
  "Queued to download",
  "Downloading",
  "Queued to seed",
  "Seeding",
];

export function statusLabel(status: number, percentDone: number): string {
  if (status === 0 && percentDone >= 1) return "Completed";
  return STATUS_LABELS[status] ?? `Unknown (${status})`;
}
