/**
 * ForexFactory's own calendar page for one month, for the dates the weekly feed does not hold.
 *
 * Read with curl on 2026-11-18 (`?month=dec.2026`, HTTP 200, 1.4 MB): the events are not in the HTML
 * rows but in a JSON array named `days`, inside `calendarComponentStates[1] = { days: [...] }`.
 * Each day is {date, dateline, events} and each event has `name`, `currency`, `impactName` (low,
 * medium, high, holiday), `forecast`, `previous`, `actual`, `timeLabel`, `timeMasked` and `dateline`,
 * a UTC unix time in seconds. The `timeLabel` is shown in the reader's zone (Europe/Minsk for that
 * request), which the code never uses. Only `dec.2026` was read; the other months' spelling follows the
 * site's own `day` links (`dec1.2026`) and is not measured. Nothing here imports `@vicinae/api`.
 */
import { execFile } from "node:child_process";

import { type CalendarEvent, type Impact } from "./feed";

export type MonthKey = { year: number; month: number };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const monthUrl = ({ year, month }: MonthKey): string =>
  `https://www.forexfactory.com/calendar?month=${MONTHS[month - 1]}.${year}`;

const IMPACT_OF: Record<string, Impact> = { low: "Low", medium: "Medium", high: "High", holiday: "Holiday" };

const DAY_MS = 86_400_000;
const START = "calendarComponentStates[1] = {";

export type MonthPage = {
  events: CalendarEvent[];
  /** The span the page's days cover, `[from, to)`, in epoch milliseconds. */
  from: number;
  to: number;
};

const NO_DATA = "ForexFactory answered with a page that has no calendar data (a bot check, or the site changed)";
const SHAPE = "The ForexFactory calendar page has an unexpected shape";

/** The index just past the JSON array that starts at `start`, found by balancing brackets outside strings. */
function arrayEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return i + 1;
  }
  return -1;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

function parseEvent(raw: unknown): CalendarEvent | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const entry = raw as Record<string, unknown>;
  const title = str(entry.name);
  const currency = str(entry.currency);
  const impact = IMPACT_OF[str(entry.impactName)];
  if (!title || !currency || !impact || typeof entry.dateline !== "number") return undefined;
  return {
    title,
    currency,
    at: entry.dateline * 1000,
    impact,
    forecast: str(entry.forecast),
    previous: str(entry.previous),
    actual: str(entry.actual),
    ...(entry.timeMasked === true && str(entry.timeLabel) ? { timeLabel: str(entry.timeLabel) } : {}),
  };
}

/** Throws with a message fit for the UI when the page is not the calendar. */
export function parseMonthPage(html: string): MonthPage {
  const state = html.indexOf(START);
  const days = state === -1 ? -1 : html.indexOf("days: [", state);
  if (days === -1) throw new Error(NO_DATA);
  const start = days + "days: ".length;
  const end = arrayEnd(html, start);
  let list: unknown;
  try {
    list = end === -1 ? undefined : JSON.parse(html.slice(start, end));
  } catch {
    throw new Error(SHAPE);
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${SHAPE}: no days`);

  const rows = list as Array<{ dateline?: unknown; events?: unknown }>;
  const first = rows[0]?.dateline;
  const last = rows[rows.length - 1]?.dateline;
  if (typeof first !== "number" || typeof last !== "number") throw new Error(`${SHAPE}: a day has no dateline`);

  const events = rows
    .flatMap((day) => (Array.isArray(day.events) ? day.events : []))
    .map(parseEvent)
    .filter((event): event is CalendarEvent => event !== undefined);
  return {
    events: events.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title)),
    from: first * 1000,
    to: last * 1000 + DAY_MS,
  };
}

export function shiftMonth({ year, month }: MonthKey, by: number): MonthKey {
  const n = year * 12 + (month - 1) + by;
  return { year: Math.floor(n / 12), month: (n % 12) + 1 };
}

/** The events of several pages in time order, once each: a month page and its neighbour can both hold an edge event. */
export function mergeEvents(pages: { events: CalendarEvent[] }[]): CalendarEvent[] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.events)
    .filter((event) => {
      const id = `${event.at}|${event.currency}|${event.title}`;
      return seen.has(id) ? false : (seen.add(id), true);
    })
    .sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}

/** Which sides of `span` the pages leave uncovered, so the neighbouring month must be read as well. */
export function uncoveredSides(pages: { from: number; to: number }[], span: [number, number]): { before: boolean; after: boolean } {
  return {
    before: span[0] < Math.min(...pages.map((page) => page.from)),
    after: span[1] > Math.max(...pages.map((page) => page.to)),
  };
}

// curl, not fetch: the Yahoo reader in the prices extension was refused to Node's fetch and not to curl, and
// this page sits behind the same kind of bot filter. The agent is the one the page was read with.
const AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

export function fetchMonthPage(key: MonthKey): Promise<string> {
  const args = ["-sS", "-m", "30", "-A", AGENT, "-w", "\n%{http_code}", monthUrl(key)];
  return new Promise((resolve, reject) => {
    execFile("curl", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 35_000 }, (error, stdout) => {
      if (error) {
        const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
        reject(new Error(missing ? "curl is not installed; install it to read ForexFactory's month pages" : `Could not reach ForexFactory: ${error.message.split("\n")[0]}`));
        return;
      }
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1));
      if (status === 429) reject(new Error("ForexFactory is rate limiting this address; try again in a few minutes"));
      else if (status !== 200) reject(new Error(`ForexFactory answered HTTP ${status} for that month`));
      else resolve(stdout.slice(0, cut));
    });
  });
}
