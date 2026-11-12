/**
 * Everything here is a pure function of a zone id and an instant. No luxon:
 * `Intl.DateTimeFormat` with an explicit zone does the work, and the locale is
 * pinned to en-US on every call so the machine's locale cannot reorder a date
 * or swap in a twelve-hour clock where a 24-hour one was expected.
 */

import { zoneOf } from "~/utils/zones";

export type DeltaStyle = "clock" | "text";

/** The clock is eight columns wide in a code block once it is space-padded. */
export const CLOCK_WIDTH = 8;

/**
 * Building an `Intl.DateTimeFormat` is expensive and the timeline asks for the
 * same handful of formats once per city per render, so they are kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const cached = formatters.get(key);
  if (cached) return cached;

  const built = new Intl.DateTimeFormat("en-US", options);
  formatters.set(key, built);
  return built;
}

const numeric = (zone: string): Intl.DateTimeFormat =>
  formatter({
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export type ZoneParts = {
  /** Minutes east of UTC at that instant, so daylight saving is already in it. */
  offset: number;
  hour: number;
  minute: number;
  second: number;
  /** Days since the epoch in the zone's own calendar, for comparing dates. */
  day: number;
};

/**
 * One `formatToParts` call gives the local calendar and the offset. The offset
 * comes from reading the local wall clock as though it were UTC and comparing,
 * which is exact for 45-minute zones where dividing by 60 and rounding is not.
 */
export function zoneParts(zone: string, at: Date): ZoneParts {
  const parts = numeric(zone).formatToParts(at);
  const number = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);

  const year = number("year");
  const month = number("month");
  const day = number("day");
  // Node renders midnight as hour 24 under hour12:false.
  const hour = number("hour") % 24;
  const minute = number("minute");
  const second = number("second");

  const asIfUTC = Date.UTC(year, month - 1, day, hour, minute, second);

  return {
    offset: Math.round((asIfUTC - at.getTime() - at.getMilliseconds()) / 60_000),
    hour,
    minute,
    second,
    day: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
  };
}

/** Minutes east of UTC, read at the instant rather than cached per zone. */
export function offsetMinutes(zone: string, at: Date): number {
  return zoneParts(zone, at).offset;
}

/** Which twelve-hour style the clocks use. */
export type ClockStyle = "12h" | "24h";

export type ClockFormatPreference = "system" | "12-hour" | "24-hour";

/** The preference resolved against the system's own twelve-hour-ness. */
export function clockFormat(preference: ClockFormatPreference | undefined): ClockStyle {
  if (preference === "12-hour") return "12h";
  if (preference === "24-hour") return "24h";
  const system = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
  // hourCycle is not in the lib's ResolvedDateTimeFormatOptions, but the runtime fills it.
  const cycle = (system as { hourCycle?: string }).hourCycle;
  return system.hour12 === false || cycle?.startsWith("h2") ? "24h" : "12h";
}

/** "6:39 PM" (or "18:39"): the clock in the zone's own wall time. */
export function zoneClock(zone: string, at: Date, style: ClockStyle = "12h"): string {
  return formatter({ timeZone: zone, hour: "numeric", minute: "2-digit", hour12: style === "12h" }).format(at);
}

/** "Wed". The timeline's midnight cell spells the day, rotated upright. */
export function zoneWeekday(zone: string, at: Date): string {
  return formatter({ timeZone: zone, weekday: "short" }).format(at);
}

/** "Wed, Apr 8". */
export function zoneDay(zone: string, at: Date): string {
  return formatter({ timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(at);
}

/** "Wednesday, April 8, 2026". */
export function zoneDate(zone: string, at: Date): string {
  return formatter({ timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(at);
}

/** "GMT+5:30", "GMT-7", "GMT+0". */
export function formatGmtOffset(offset: number): string {
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

/** "+9:30" for a clock column, "-9h 30m" for prose, "same" for no difference. */
export function formatDelta(delta: number, style: DeltaStyle = "text"): string {
  if (delta === 0) return "same";

  const sign = delta < 0 ? "-" : "+";
  const absolute = Math.abs(delta);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  if (minutes === 0) {
    return style === "clock" ? `${sign}${hours}:00` : `${sign}${hours} hr${hours === 1 ? "" : "s"}`;
  }

  if (style === "clock") return `${sign}${hours}:${String(minutes).padStart(2, "0")}`;
  return `${sign}${hours}h ${minutes}m`;
}

/**
 * The instant of local noon in the zone around `at`. SunCalc picks the solar day
 * closest to the instant it is given, so sunrise for a 1 AM instant belongs to
 * the wrong date; every sun lookup goes through the local noon instead. Two
 * passes, because the offset itself can change between `at` and that noon.
 */
export function localNoon(zone: string, at: Date): Date {
  const parts = zoneParts(zone, at);
  const noonMs = parts.day * 86_400_000 + 12 * 3_600_000;
  let noon = new Date(noonMs - parts.offset * 60_000);
  const later = zoneParts(zone, noon);
  if (later.offset !== parts.offset) {
    noon = new Date(noonMs - later.offset * 60_000);
  }
  return noon;
}

/** "", " +1" or " -1": whether the zone is on another calendar day from the base. */
export function dayShift(zone: string, base: string, at: Date): string {
  const difference = zoneParts(zone, at).day - zoneParts(base, at).day;
  if (difference === 0) return "";
  return difference > 0 ? ` +${difference}` : ` ${difference}`;
}

/** How the cities are ordered: west to east by offset, or the saved arrangement. */
export type CityOrder = "offset-asc" | "offset-desc" | "custom";

/**
 * Offsets are read at the scrubbed time, so a daylight saving change re-sorts
 * the rows instead of leaving a city on the wrong side of the list.
 */
export function sortZones(ids: string[], at: Date, order: CityOrder): string[] {
  if (order === "custom") return ids;
  const direction = order === "offset-desc" ? -1 : 1;
  return [...ids].sort((a, b) => {
    // Bare zone ids sort like their zone name; a city id and its bare zone land
    // together, which only happens when the Local row joins the list.
    const key = (id: string) => zoneOf(id);
    const difference = offsetMinutes(key(a), at) - offsetMinutes(key(b), at);
    return difference !== 0 ? difference * direction : key(a).localeCompare(key(b));
  });
}
