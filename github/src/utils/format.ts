/**
 * Date formatting. `Intl` covers both, so there is no date library here.
 */

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "3 days ago", "in 2 months". Picks the largest unit that fits, so a timestamp
 * three hours old reads as "3 hours ago" rather than "0 minutes ago".
 *
 * Anything under a minute reads as "just now" because GitHub timestamps are
 * second-resolution and "0 seconds ago" is noise in a list row.
 */
export function relativeTime(isoDate: string, now: Date = new Date()): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return "";

  const deltaMs = timestamp - now.getTime();
  const magnitude = Math.abs(deltaMs);
  if (magnitude < 60_000) return "just now";

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (magnitude >= ms) {
      return formatter.format(Math.round(deltaMs / ms), unit);
    }
  }

  return formatter.format(Math.round(deltaMs / 1000), "second");
}

/** "12 Mar 2024", for subtitles and detail bodies. */
export function absoluteDate(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return "";

  return new Date(timestamp).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "1.2k", "3.4M", for star and fork counts. */
export function compactCount(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
