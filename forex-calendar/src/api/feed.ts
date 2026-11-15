/**
 * ForexFactory's public weekly calendar feed, published by Fair Economy.
 *
 * The body is a JSON array of {title, country, date, impact, forecast, previous}; `date` is ISO 8601
 * with a UTC offset and `impact` is Low, Medium, High or Holiday (read 2026-11-15). There is no
 * `actual` field and no other week: the file always holds the current week. Nothing here imports
 * `@vicinae/api`, so the tests can load it headless.
 */

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

export type Impact = "Holiday" | "Low" | "Medium" | "High";

export type CalendarEvent = {
  title: string;
  /** The feed's `country` field: a currency code, or `All` for events that concern every market. */
  currency: string;
  /** Epoch milliseconds. */
  at: number;
  impact: Impact;
  forecast: string;
  previous: string;
};

const IMPACTS: readonly string[] = ["Holiday", "Low", "Medium", "High"];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseEvent(raw: unknown): CalendarEvent | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const entry = raw as Record<string, unknown>;
  const title = text(entry.title);
  const currency = text(entry.country);
  const at = Date.parse(text(entry.date));
  const impact = text(entry.impact);
  if (!title || !currency || Number.isNaN(at) || !IMPACTS.includes(impact)) return undefined;
  return { title, currency, at, impact: impact as Impact, forecast: text(entry.forecast), previous: text(entry.previous) };
}

/** Throws with a message fit for the UI when the body is not the feed. */
export function parseFeed(body: string): CalendarEvent[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("The calendar feed answered with something that is not JSON (a block page, or the feed moved)");
  }
  if (!Array.isArray(json)) throw new Error("The calendar feed has an unexpected shape: expected a list of events");

  const events = json.map(parseEvent).filter((event): event is CalendarEvent => event !== undefined);
  if (json.length > 0 && events.length === 0) {
    throw new Error("The calendar feed has an unexpected shape: no entry has a title, currency, date and impact");
  }
  return events.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}

export async function fetchFeedBody(): Promise<string> {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (response.status === 429) throw new Error("ForexFactory is rate limiting this address; try again in a few minutes");
  if (!response.ok) throw new Error(`The calendar feed answered HTTP ${response.status}`);
  return response.text();
}
