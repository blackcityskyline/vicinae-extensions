import { Cache } from "@vicinae/api";

import { fetchFeedBody, parseFeed, type CalendarEvent, type FeedWeek } from "./feed";
import { fetchMonthPage, mergeEvents, parseMonthPage, shiftMonth, uncoveredSides, type MonthKey, type MonthPage } from "./ff-month";
import type { Source } from "~/utils/select";

/** The feed is a public file that changes a few times a day; polling it faster only invites a block. */
const FRESH_MS = 30 * 60_000;
/** A manual refresh still refuses to hit the feed twice within a minute. */
const FORCED_MIN_MS = 60_000;

// The feed is public, so the plain-text cache is fine here. One key per week.
const cache = new Cache();

type Stored = { fetchedAt: number; body: string };

export type Loaded = {
  events: CalendarEvent[];
  fetchedAt: number;
  /** Why the feed could not be refreshed, when `events` come from the saved copy. */
  failure?: string;
};

function readStored(week: FeedWeek): Stored | undefined {
  const raw = cache.get(week);
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as Stored;
    parseFeed(stored.body);
    return typeof stored.fetchedAt === "number" ? stored : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The saved copy when it is fresh enough, otherwise the feed. When the feed fails and a saved copy
 * exists, that copy comes back with the reason; with none, the error is thrown.
 */
export async function loadFeed(week: FeedWeek, force: boolean): Promise<Loaded> {
  const stored = readStored(week);
  const age = stored ? Date.now() - stored.fetchedAt : Infinity;
  if (stored && age < (force ? FORCED_MIN_MS : FRESH_MS)) {
    return { events: parseFeed(stored.body), fetchedAt: stored.fetchedAt };
  }

  try {
    const body = await fetchFeedBody(week);
    const events = parseFeed(body);
    const fetchedAt = Date.now();
    cache.set(week, JSON.stringify({ fetchedAt, body } satisfies Stored));
    return { events, fetchedAt };
  } catch (cause) {
    if (!stored) throw cause;
    return { events: parseFeed(stored.body), fetchedAt: stored.fetchedAt, failure: (cause as Error).message };
  }
}

/** Each month is a 1.4 MB page, so a span is capped to keep a mistyped range from fetching years of them. */
export const MAX_MONTHS = 12;

/** A month that ended this long ago no longer changes, so its saved copy is kept until asked for again. */
const FINAL_AFTER_MS = 7 * 86_400_000;

type StoredMonth = MonthPage & { fetchedAt: number };

const monthName = ({ year, month }: MonthKey) => `${year}-${String(month).padStart(2, "0")}`;

function readMonth(key: MonthKey): StoredMonth | undefined {
  const raw = cache.get(`month-${monthName(key)}`);
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as StoredMonth;
    const ok = Array.isArray(stored.events) && [stored.fetchedAt, stored.from, stored.to].every((n) => typeof n === "number");
    return ok ? stored : undefined;
  } catch {
    return undefined;
  }
}

async function loadMonth(key: MonthKey, force: boolean): Promise<{ page: StoredMonth; failure?: string }> {
  const stored = readMonth(key);
  const final = Date.now() - new Date(key.year, key.month, 1).getTime() > FINAL_AFTER_MS;
  const age = stored ? Date.now() - stored.fetchedAt : Infinity;
  if (stored && age < (force ? FORCED_MIN_MS : final ? Infinity : FRESH_MS)) return { page: stored };

  try {
    const page = { ...parseMonthPage(await fetchMonthPage(key)), fetchedAt: Date.now() };
    cache.set(`month-${monthName(key)}`, JSON.stringify(page));
    return { page };
  } catch (cause) {
    if (!stored) throw cause;
    return { page: stored, failure: (cause as Error).message };
  }
}

/**
 * The events of ForexFactory's month pages for `months`, read one after another so as not to hit the
 * site in parallel. Each page lists its days in the reader's zone, not necessarily this machine's, so
 * when the pages leave the start or the end of `span` uncovered the neighbouring month is read too.
 * A month that cannot be read is named in `failure` while the others still show; with none readable
 * the error is thrown.
 */
export async function loadMonths(months: MonthKey[], span: [number, number], force: boolean): Promise<Loaded> {
  if (months.length > MAX_MONTHS) throw new Error(`Choose at most ${MAX_MONTHS} months at a time; this range spans ${months.length}`);
  if (months.length === 0) return { events: [], fetchedAt: Date.now() };

  const pages: StoredMonth[] = [];
  const failures: string[] = [];
  const add = async (key: MonthKey) => {
    try {
      const { page, failure } = await loadMonth(key, force);
      pages.push(page);
      if (failure) failures.push(`${monthName(key)}: ${failure}`);
    } catch (cause) {
      failures.push(`${monthName(key)}: ${(cause as Error).message}`);
    }
  };
  for (const key of months) await add(key);
  if (pages.length === 0) throw new Error(failures[0] ?? "No month could be read");

  const sides = uncoveredSides(pages, span);
  if (sides.before) await add(shiftMonth(months[0]!, -1));
  if (sides.after) await add(shiftMonth(months[months.length - 1]!, 1));

  const events = mergeEvents(pages);
  return {
    events,
    fetchedAt: Math.min(...pages.map((p) => p.fetchedAt)),
    ...(failures.length > 0 ? { failure: failures.join("; ") } : {}),
  };
}

export const loadSource = (source: Source, force: boolean): Promise<Loaded> =>
  source.kind === "week" ? loadFeed(source.week, force) : loadMonths(source.months, source.span, force);
