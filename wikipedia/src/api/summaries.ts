import { Cache } from "@vicinae/api";

import type { Locale } from "~/utils/language";
import { storeSummary, type SummaryIndex, type StoredSummary } from "~/utils/summaries";

/** One index per language: a cache key holds a single string. */
const key = (language: Locale) => `summaries:${language}`;

export async function readSummaries(language: Locale): Promise<SummaryIndex> {
	const raw = await new Cache().get(key(language));
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null ? (parsed as SummaryIndex) : {};
	} catch {
		return {};
	}
}

/** Read by every article opened, written once per article: the covers of the recent list. */
export async function rememberSummary(
	language: Locale,
	summary: { title: string; description?: string; thumbnail?: string },
): Promise<void> {
	if (!summary.title) return;
	const cache = new Cache();
	const index = await readSummaries(language);
	const known = index[summary.title];
	const entry: StoredSummary = { ...summary, at: Date.now() };
	if (known && known.description === entry.description && known.thumbnail === entry.thumbnail) return;
	await cache.set(key(language), JSON.stringify(storeSummary(index, entry)));
}
