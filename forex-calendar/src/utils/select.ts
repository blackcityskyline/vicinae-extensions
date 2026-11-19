import type { CalendarEvent, FeedWeek } from "~/api/feed";
import type { MonthKey } from "~/api/ff-month";
import type { Filters } from "~/utils/filters";

export type Period =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "upcoming"
  | "week"
  | "nextweek"
  | "month"
  | "nextmonth"
  | "lastmonth"
  | "range";

/** The feed files only ever hold one week each; every period but the next week lives in this one. */
export const feedWeekOf = (period: Period): FeedWeek => (period === "nextweek" ? "nextweek" : "thisweek");

/** The periods the weekly feed cannot serve, which are read from ForexFactory's month pages. */
export const isMonthPeriod = (period: Period): boolean =>
  period === "month" || period === "nextmonth" || period === "lastmonth" || period === "range";

/** The days the user picked, `[from, to)` in epoch milliseconds. */
export type Range = [number, number];

/** The feed marks events that concern every market with this instead of a currency. */
const GLOBAL = "All";

function localMidnight(now: Date, dayOffset: number): number {
  // `new Date(y, m, d + n)` lands on local midnight even across a daylight saving change.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset).getTime();
}

function localMonthStart(now: Date, monthOffset: number): number {
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getTime();
}

/** `[from, to)` in epoch milliseconds, in this machine's time zone. An unchosen range is empty. */
export function periodBounds(period: Period, now: Date, range?: Range): [number, number] {
  switch (period) {
    case "today":
      return [localMidnight(now, 0), localMidnight(now, 1)];
    case "tomorrow":
      return [localMidnight(now, 1), localMidnight(now, 2)];
    case "yesterday":
      return [localMidnight(now, -1), localMidnight(now, 0)];
    case "upcoming":
      return [now.getTime(), Infinity];
    case "week":
    case "nextweek":
      return [-Infinity, Infinity];
    case "month":
      return [localMonthStart(now, 0), localMonthStart(now, 1)];
    case "nextmonth":
      return [localMonthStart(now, 1), localMonthStart(now, 2)];
    case "lastmonth":
      return [localMonthStart(now, -1), localMonthStart(now, 0)];
    case "range":
      return range ?? [0, 0];
  }
}

/** The local calendar months that `[from, to)` touches, oldest first. */
export function monthsOf(from: number, to: number): MonthKey[] {
  if (!(to > from)) return [];
  const first = new Date(from);
  const last = new Date(to - 1);
  const months: MonthKey[] = [];
  for (let n = first.getFullYear() * 12 + first.getMonth(); n <= last.getFullYear() * 12 + last.getMonth(); n++) {
    months.push({ year: Math.floor(n / 12), month: (n % 12) + 1 });
  }
  return months;
}

/** Where a period's events come from: one of the two weekly feeds, or the month pages it spans. */
export type Source =
  | { key: string; kind: "week"; week: FeedWeek }
  | { key: string; kind: "months"; months: MonthKey[]; span: Range };

const pad2 = (value: number) => String(value).padStart(2, "0");

export function sourceOf(period: Period, now: Date, range?: Range): Source {
  if (!isMonthPeriod(period)) {
    const week = feedWeekOf(period);
    return { key: week, kind: "week", week };
  }
  const [from, to] = periodBounds(period, now, range);
  const months = monthsOf(from, to);
  return { key: `months:${months.map((m) => `${m.year}-${pad2(m.month)}`).join(",")}`, kind: "months", months, span: [from, to] };
}

type Selection = { period: Period; now: Date; filters: Filters; range?: Range };

export function selectEvents(events: CalendarEvent[], { period, now, filters, range }: Selection): CalendarEvent[] {
  const [from, to] = periodBounds(period, now, range);
  const { impacts, currencies } = filters;
  return events.filter(
    (event) =>
      event.at >= from &&
      event.at < to &&
      (impacts.length === 0 || impacts.includes(event.impact)) &&
      (currencies.length === 0 || event.currency === GLOBAL || currencies.includes(event.currency)),
  );
}

type DayGroup = { key: string; events: CalendarEvent[] };

const pad = (value: number) => String(value).padStart(2, "0");

/** Splits at local midnight; `key` is the local date as YYYY-MM-DD. Input order is kept. */
export function groupByDay(events: CalendarEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const date = new Date(event.at);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, events: [event] });
  }
  return groups;
}
