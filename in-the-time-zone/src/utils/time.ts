/**
 * Everything here is a pure function of a zone id and an instant. No luxon:
 * `Intl.DateTimeFormat` with an explicit zone does the work, and the locale is
 * pinned to en-US on every call so the machine's locale cannot reorder a date
 * or swap in a twelve-hour clock where a 24-hour one was expected.
 */

export type HourKind = "work" | "sleep" | "marginal";

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
    day: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
  };
}

/** Minutes east of UTC, read at the instant rather than cached per zone. */
export function offsetMinutes(zone: string, at: Date): number {
  return zoneParts(zone, at).offset;
}

/** "6:39 PM". Not zero-padded, because the columns have to line up. */
export function zoneClock(zone: string, at: Date): string {
  return formatter({ timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
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

/** The bands the legend and the block colours both come from. */
export function hourKind(hour: number): HourKind {
  if (hour >= 0 && hour < 7) return "sleep";
  if (hour >= 9 && hour < 17) return "work";
  return "marginal";
}

/** "", " +1" or " -1": whether the zone is on another calendar day from the base. */
export function dayShift(zone: string, base: string, at: Date): string {
  const difference = zoneParts(zone, at).day - zoneParts(base, at).day;
  if (difference === 0) return "";
  return difference > 0 ? ` +${difference}` : ` ${difference}`;
}
