/**
 * The covers of the articles already read. The recent list keeps titles only, so
 * this is the one thing it cannot ask Wikipedia again for without a request per
 * row. Pure: the file the index is kept in lives in `~/api/summaries.ts`.
 */

export type StoredSummary = {
	title: string;
	description?: string;
	thumbnail?: string;
	/** When it was read, so the oldest can be dropped first. */
	at: number;
};

/** Keyed by article title; one language per index. */
export type SummaryIndex = Record<string, StoredSummary>;

/** Enough for the 20 recents plus the same articles read in other languages. */
export const SUMMARY_LIMIT = 40;

/** Adds one article, newest first, dropping the oldest when the index is full. */
export function storeSummary(index: SummaryIndex | undefined, entry: StoredSummary): SummaryIndex {
	const next: SummaryIndex = { ...index, [entry.title]: entry };
	const entries = Object.values(next).sort((a, b) => b.at - a.at);
	return Object.fromEntries(entries.slice(0, SUMMARY_LIMIT).map((stored) => [stored.title, stored]));
}

export function summaryOf(index: SummaryIndex | undefined, title: string): StoredSummary | undefined {
	return index?.[title];
}
