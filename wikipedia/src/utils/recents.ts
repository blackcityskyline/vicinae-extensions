import { useCachedState } from "@raycast/utils";
import { useCallback } from "react";

import { useLanguage } from "~/api/language";
import type { Locale } from "~/utils/language";

export function useRecentArticles() {
	const [language] = useLanguage();
	const [readArticles, setReadArticles] = useCachedState<Partial<Record<Locale, string[]>>>("recentArticles");

	const addToReadArticles = useCallback(
		({ title, language }: { title: string; language: Locale }) => {
			// A deeplink with no article title reaches the reader with an empty one;
			// recording it would put a keyless row in the list forever.
			if (!title) return;
			setReadArticles((r) => ({
				...r,
				[language]: [title, ...(r?.[language] ?? []).filter((article) => article !== title)].slice(0, 20),
			}));
		},
		[setReadArticles],
	);

	const removeFromReadArticles = useCallback(
		({ title, language }: { title: string; language: Locale }) => {
			setReadArticles((r) => ({
				...r,
				[language]: (r?.[language] ?? []).filter((article) => article !== title),
			}));
		},
		[setReadArticles],
	);

	const clearReadArticles = useCallback(() => {
		setReadArticles({});
	}, [setReadArticles]);

	return {
		readArticles: (readArticles?.[language] ?? []).filter(Boolean),
		addToReadArticles,
		removeFromReadArticles,
		clearReadArticles,
	};
}
