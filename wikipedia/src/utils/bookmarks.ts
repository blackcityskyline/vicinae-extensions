/**
 * The saved articles of the reader. Pure: the hook that stores them in the cache
 * lives in `~/api/bookmarks.ts`, so the self-checks need no launcher.
 */

import type { Locale } from "~/utils/language";

/** The reader chose these, so they outlive the 20-article recent list. */
export const BOOKMARK_LIMIT = 100;

export type BookmarkIndex = Partial<Record<Locale, string[]>>;

export function isBookmarked(titles: string[], title: string): boolean {
	return titles.includes(title);
}

/** Newest first, one copy: bookmarking an article already saved moves it to the top. */
export function withTitle(titles: string[], title: string, limit = BOOKMARK_LIMIT): string[] {
	return [title, ...titles.filter((entry) => entry !== title)].slice(0, limit);
}

export function withoutTitle(titles: string[], title: string): string[] {
	return titles.filter((entry) => entry !== title);
}
