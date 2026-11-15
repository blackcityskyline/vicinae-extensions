import { Cache } from "@vicinae/api";

import { fetchFeedBody, parseFeed, type CalendarEvent, type FeedWeek } from "./feed";

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
