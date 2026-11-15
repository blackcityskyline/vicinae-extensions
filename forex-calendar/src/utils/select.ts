import type { CalendarEvent, FeedWeek } from "~/api/feed";
import type { Filters } from "~/utils/filters";

export type Period = "today" | "tomorrow" | "yesterday" | "upcoming" | "week" | "nextweek";

/** The feed files only ever hold one week each; every period but the next week lives in this one. */
export const feedWeekOf = (period: Period): FeedWeek => (period === "nextweek" ? "nextweek" : "thisweek");

/** The feed marks events that concern every market with this instead of a currency. */
const GLOBAL = "All";

function localMidnight(now: Date, dayOffset: number): number {
  // `new Date(y, m, d + n)` lands on local midnight even across a daylight saving change.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset).getTime();
}

/** `[from, to)` in epoch milliseconds, in this machine's time zone. */
export function periodBounds(period: Period, now: Date): [number, number] {
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
  }
}

type Selection = { period: Period; now: Date; filters: Filters };

export function selectEvents(events: CalendarEvent[], { period, now, filters }: Selection): CalendarEvent[] {
  const [from, to] = periodBounds(period, now);
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
