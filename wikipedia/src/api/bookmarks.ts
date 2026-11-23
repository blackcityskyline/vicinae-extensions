import { useCachedState } from "@raycast/utils";
import { useCallback } from "react";

import { useLanguage } from "~/api/language";
import { isBookmarked, withoutTitle, withTitle, type BookmarkIndex } from "~/utils/bookmarks";
import type { Locale } from "~/utils/language";

/**
 * The saved articles of the current language. Reads with the preferred language,
 * writes with the reader's own, so bookmarking while reading another language
 * files the article under its language.
 */
export function useBookmarks() {
	const [language] = useLanguage();
	const [index, setIndex] = useCachedState<BookmarkIndex>("bookmarks");

	const bookmarks = (index?.[language] ?? []).filter(Boolean);

	const toggleBookmark = useCallback(
		({ title, language }: { title: string; language: Locale }) => {
			if (!title) return;
			setIndex((saved) => {
				const titles = saved?.[language] ?? [];
				return {
					...saved,
					[language]: isBookmarked(titles, title) ? withoutTitle(titles, title) : withTitle(titles, title),
				};
			});
		},
		[setIndex],
	);

	const clearBookmarks = useCallback(() => {
		setIndex({});
	}, [setIndex]);

	return {
		bookmarks,
		isBookmarked: (title: string) => isBookmarked(bookmarks, title),
		toggleBookmark,
		clearBookmarks,
	};
}
