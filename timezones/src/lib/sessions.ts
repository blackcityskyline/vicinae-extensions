/**
 * The labelled sessions the Market Hours timeline draws: a name, the zone whose clock sets the time, a start, an
 * optional end and a colour. Times are local wall-clock constants converted through the IANA rules, so a session
 * keeps its own local hour when its zone changes its clocks and its New York hour moves instead. Pure: the file
 * that holds a custom list is read elsewhere.
 */
import { addDays, isValidZone, startOfDay, wallParts, wallToInstant } from "../core/time";

export type ClockTime = { h: number; m: number };

export type SessionDef = {
  name: string;
  timezone: string;
  start: ClockTime;
  /** Absent for a session that is only an open: a line, no bar. An end at or before the start is the next day's. */
  end?: ClockTime;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  color: string;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const at = (h: number, m = 0): ClockTime => ({ h, m });

/**
 * The built-in list. Both "Lunch" entries are their own city's lunch, London's 12:00–14:00 first and New York's
 * 12:00–13:00 second.
 */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { name: "Asia", timezone: "Asia/Tokyo", start: at(9), days: WEEKDAYS, color: "#f76b15" },
  { name: "Frankfurt", timezone: "Europe/Berlin", start: at(8), days: WEEKDAYS, color: "#3e63dd" },
  { name: "London", timezone: "Europe/London", start: at(8), days: WEEKDAYS, color: "#12a594" },
  { name: "Lunch", timezone: "Europe/London", start: at(12), end: at(14), days: WEEKDAYS, color: "#7ce2fe" },
  { name: "US", timezone: "America/New_York", start: at(7), end: at(9, 30), days: WEEKDAYS, color: "#ab4aba" },
  { name: "AM", timezone: "America/New_York", start: at(9, 30), end: at(12), days: WEEKDAYS, color: "#30a46c" },
  { name: "Lunch", timezone: "America/New_York", start: at(12), end: at(13), days: WEEKDAYS, color: "#ffc53d" },
  { name: "PM", timezone: "America/New_York", start: at(13), end: at(16), days: WEEKDAYS, color: "#e5484d" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const clockText = (t: ClockTime) => `${pad(t.h)}:${pad(t.m)}`;

/** The text a custom list starts from, so editing it begins at the defaults. */
export function serializeSessions(sessions: SessionDef[]): string {
  const rows = sessions.map((s) => ({
    name: s.name,
    timezone: s.timezone,
    start: clockText(s.start),
    ...(s.end ? { end: clockText(s.end) } : {}),
    color: s.color,
    ...(sameDays(s.days, WEEKDAYS) ? {} : { days: s.days.map((d) => DAY_NAMES[d]) }),
  }));
  return `${JSON.stringify({ sessions: rows }, null, 2)}\n`;
}

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

function parseClock(value: unknown): ClockTime | undefined {
  const match = typeof value === "string" ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? { h, m } : undefined;
}

function parseDays(value: unknown): number[] | undefined {
  if (value === undefined) return WEEKDAYS;
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const days = value.map((d) => (typeof d === "string" ? DAY_NAMES.indexOf(d.trim().toLowerCase()) : -1));
  return days.includes(-1) ? undefined : [...new Set(days)].sort((a, b) => a - b);
}

function parseSession(value: unknown): SessionDef | string {
  if (typeof value !== "object" || value === null) return "must be an object";
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return `"name" must be a non-empty text`;
  const timezone = typeof row.timezone === "string" ? row.timezone.trim() : "";
  if (!timezone || !isValidZone(timezone)) return `unknown timezone "${String(row.timezone)}", use an IANA name like Europe/London`;
  const start = parseClock(row.start);
  if (!start) return `"start" must be a time like 09:30, got ${JSON.stringify(row.start)}`;
  const end = row.end === undefined ? undefined : parseClock(row.end);
  if (row.end !== undefined && !end) return `"end" must be a time like 16:00, got ${JSON.stringify(row.end)}`;
  const color = typeof row.color === "string" ? row.color.trim() : "";
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return `"color" must be a hex like #1a2b3c, got ${JSON.stringify(row.color)}`;
  const days = parseDays(row.days);
  if (!days) return `"days" must be a non-empty list of ${DAY_NAMES.slice(1).concat(DAY_NAMES[0]!).join(", ")}`;
  return { name, timezone, start, ...(end ? { end } : {}), days, color };
}

/** The sessions in a custom file, or the first thing wrong with it, said so the file can be fixed. */
export function parseSessions(text: string): { sessions: SessionDef[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: `The file is not valid JSON: ${(e as Error).message}` };
  }
  const list = (data as { sessions?: unknown } | null)?.sessions;
  if (!Array.isArray(list)) return { error: `"sessions" must be a list of sessions` };
  if (list.length === 0) return { error: `"sessions" needs at least one session` };
  const sessions: SessionDef[] = [];
  for (const [i, entry] of list.entries()) {
    const parsed = parseSession(entry);
    if (typeof parsed === "string") return { error: `session ${i + 1}: ${parsed}` };
    sessions.push(parsed);
  }
  return { sessions };
}

/** What the timeline draws for one occurrence of a session. */
export type Span = { label: string; color: string; at: number; end?: number };

type Occurrence = { start: number; end?: number };

/** The occurrence of a session that begins on the given local calendar date, when that weekday is one of its days. */
function occurrenceOn(s: SessionDef, day: number): Occurrence | undefined {
  const p = wallParts(day, s.timezone);
  if (!s.days.includes(p.weekday)) return undefined;
  const start = wallToInstant(s.timezone, p.y, p.m, p.d, s.start.h, s.start.m);
  if (!s.end) return { start };
  const overnight = s.end.h * 60 + s.end.m <= s.start.h * 60 + s.start.m;
  return { start, end: wallToInstant(s.timezone, p.y, p.m, p.d + (overnight ? 1 : 0), s.end.h, s.end.m) };
}

/**
 * Every occurrence touching `[from, to)`, in time order and, for the same instant, in list order: an open when it
 * falls inside, a window when any of it does, so one that began before `from` still shows its tail.
 */
export function spansBetween(sessions: SessionDef[], from: number, to: number): Span[] {
  const spans: Span[] = [];
  for (const s of sessions) {
    for (let day = addDays(startOfDay(from, s.timezone), s.timezone, -1); day < to + 86_400_000; day = addDays(day, s.timezone, 1)) {
      const o = occurrenceOn(s, day);
      if (!o) continue;
      const inside = o.end === undefined ? o.start >= from && o.start < to : o.end > from && o.start < to;
      if (inside) spans.push({ label: s.name, color: s.color, at: o.start, ...(o.end === undefined ? {} : { end: o.end }) });
    }
  }
  return spans.sort((a, b) => a.at - b.at);
}

/** The first start of each session at or after `from`, in list order. */
export function firstStartsFrom(sessions: SessionDef[], from: number): { label: string; color: string; at: number }[] {
  return sessions.flatMap((s) => {
    for (let i = 0, day = startOfDay(from, s.timezone); i < 9; i++, day = addDays(day, s.timezone, 1)) {
      const o = occurrenceOn(s, day);
      if (o && o.start >= from) return [{ label: s.name, color: s.color, at: o.start }];
    }
    return [];
  });
}
