/**
 * Zone arithmetic on top of Intl only. All instants are ms since epoch; wall-clock values are plain numbers.
 */

export type WallParts = {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  min: number;
  s: number;
  weekday: number; // 0 = Sunday
};

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(tz: string): Intl.DateTimeFormat {
  let f = partFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    partFormatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isValidZone(tz: string): boolean {
  try {
    partFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock fields of an instant in a zone. */
export function wallParts(instant: number, tz: string): WallParts {
  const parts = partFormatter(tz).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const h = Number(get("hour"));
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: h === 24 ? 0 : h,
    min: Number(get("minute")),
    s: Number(get("second")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Offset of a zone from UTC, in minutes, at an instant (east positive). */
export function zoneOffset(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * Instant for a wall-clock time in a zone. For times in a DST gap the later reading is used;
 * for ambiguous times in a fall-back overlap the first (DST) reading is used.
 */
export function wallToInstant(tz: string, y: number, m: number, d: number, h = 0, min = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Probe the offsets a day either side so both readings around a transition are tried, whatever the zone's sign.
  const off1 = zoneOffset(guess - 86400000, tz);
  const off2 = zoneOffset(guess + 86400000, tz);
  const t1 = guess - off1 * 60000;
  const t2 = guess - off2 * 60000;
  const ok1 = zoneOffset(t1, tz) === off1;
  const ok2 = zoneOffset(t2, tz) === off2;
  if (ok1 && ok2) return Math.min(t1, t2); // overlap: first (DST) reading
  if (ok1) return t1;
  if (ok2) return t2;
  return Math.max(t1, t2); // gap: shift forward
}

/** Same wall-clock day/month/year in a zone, at midnight. */
export function startOfDay(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  return wallToInstant(tz, p.y, p.m, p.d);
}

/** Add whole days to a wall-clock date in a zone (DST-safe). */
export function addDays(instant: number, tz: string, days: number): number {
  const p = wallParts(instant, tz);
  return wallToInstant(tz, p.y, p.m, p.d + days, p.h, p.min);
}

/** Day number (days since epoch) of the wall date in a zone, for comparing calendar dates across zones. */
export function dayNumber(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

/** The instant the zone's local hour begins; the timeline lays each row out from it. */
export function localHourStart(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  return instant - p.min * 60000 - p.s * 1000 - (instant % 1000);
}

/**
 * Local noon in the zone around an instant. SunCalc picks the solar day closest to the instant it is given,
 * so a sunrise asked for at 1 AM belongs to the wrong date; every sun lookup goes through the local noon.
 * Two passes, because the offset itself can change between the instant and that noon.
 */
export function localNoon(instant: number, tz: string): number {
  const noonMs = dayNumber(instant, tz) * 86400000 + 12 * 3600000;
  let noon = noonMs - zoneOffset(instant, tz) * 60000;
  const later = zoneOffset(noon, tz);
  if (later !== zoneOffset(instant, tz)) noon = noonMs - later * 60000;
  return noon;
}

/** Days in a month (m = 1-12). */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const ABBR = /^[A-Z]{2,5}$/;
const abbrFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Short zone name for an instant ("CEST", "PDT"). Falls back to the supplied table (standard, daylight) and
 * finally to "UTC+2" style.
 */
export function zoneAbbreviation(instant: number, tz: string, table?: string[]): string {
  for (const locale of ["en-US", "en-GB", "en-AU", "en-IN"]) {
    const key = `${locale}|${tz}`;
    let f = abbrFormatters.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" });
      abbrFormatters.set(key, f);
    }
    const n = f.formatToParts(new Date(instant)).find((p) => p.type === "timeZoneName")?.value ?? "";
    if (ABBR.test(n)) return n;
  }
  if (table && table.length) {
    if (table.length === 1) return table[0];
    const jan = zoneOffset(Date.UTC(new Date(instant).getUTCFullYear(), 0, 15), tz);
    const jul = zoneOffset(Date.UTC(new Date(instant).getUTCFullYear(), 6, 15), tz);
    const std = Math.min(jan, jul);
    return zoneOffset(instant, tz) > std ? table[1] : table[0];
  }
  return formatOffset(zoneOffset(instant, tz), "UTC");
}

/** "+2h", "−5:30", "±0" (relative) or "UTC+2" (absolute) for a minute offset. */
export function formatOffset(minutes: number, prefix = ""): string {
  if (minutes === 0) return prefix ? prefix : "±0";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = m ? `${h}:${String(m).padStart(2, "0")}` : `${h}${prefix ? "" : "h"}`;
  return `${prefix}${sign}${body}`;
}

/** Fixed-offset IANA-compatible zone name for Intl: Etc/GMT has inverted sign; sub-hour offsets are unsupported. */
export function fixedOffsetZone(minutes: number): string | undefined {
  if (minutes === 0) return "UTC";
  if (minutes % 60 !== 0) return undefined;
  const h = minutes / 60;
  if (Math.abs(h) > 14) return undefined;
  return `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`;
}
