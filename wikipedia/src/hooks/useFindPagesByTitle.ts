import { useCachedPromise } from "@raycast/utils";

import { getSearchAnswer, getSearchFacts } from "~/utils/api";
import type { Locale } from "~/utils/language";
import { factsFor, type FoundPage, type PageFacts } from "~/utils/search";

export type FoundRow = FoundPage & PageFacts;

export type Found = {
	language: Locale;
	rows: FoundRow[];
	/** The engine's spelling fix; it searched the query as typed regardless. */
	suggestion?: string;
};

/**
 * A search and the facts of what it found: two requests per query, whatever the
 * number of rows. An empty query asks nothing.
 */
async function findPages(search: string, language: Locale): Promise<Found> {
	if (!search.trim()) return { language, rows: [] };

	const answer = await getSearchAnswer(search, language);
	const facts = await getSearchFacts(
		answer.results.map((result) => result.title),
		language,
	);

	return {
		language,
		rows: answer.results.map((result) => ({ ...result, ...factsFor(facts, result.title) })),
		...(answer.suggestion ? { suggestion: answer.suggestion } : {}),
	};
}

export default function useFindPagesByTitle(search: string, language: Locale) {
	return useCachedPromise(findPages, [search, language], { keepPreviousData: true });
}
