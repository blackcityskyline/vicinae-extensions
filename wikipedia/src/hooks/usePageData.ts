import { useCachedPromise, useFetch } from "@raycast/utils";

import {
	getPageContent,
	getPageLangLinks,
	getPageLinks,
	getPageMetadata,
	type PageMetadata,
	type PageSummary,
	requestHeaders,
} from "~/utils/api";
import { apiBase, type Locale } from "~/utils/language";

export function usePageSummary(title: string, language: Locale) {
	return useFetch<PageSummary>(`${apiBase(language)}api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
		headers: requestHeaders(language),
		// A missing article still answers 200-parseable JSON, with "Not found." where the
		// article would be: a body without a title is a refusal, not a page.
		parseResponse: (response) =>
			response.json().then((body: PageSummary & { detail?: string }) => {
				if (!body?.title) throw new Error(body?.detail ?? "Wikipedia has no article with this title.");
				return body;
			}),
	});
}

function usePageContent(title: string, language: Locale) {
	return useCachedPromise(
		(title: string, language: Locale) => getPageContent(title, language).catch(() => []),
		[title, language],
	);
}

function usePageMetadata(title: string, language: Locale) {
	return useCachedPromise(
		(title: string, language: Locale) =>
			getPageMetadata(title, language)
				.then((data) => ((data as { general?: PageMetadata }).general ?? {}) as PageMetadata)
				.catch(() => ({})),
		[title, language],
	);
}

function usePageLinks(title: string, language: Locale) {
	return useCachedPromise((title: string, language: Locale) => getPageLinks(title, language), [title, language]);
}

export function useAvailableLanguages(title: string, language: Locale) {
	return useCachedPromise(
		(title: string, language: Locale) => getPageLangLinks(title, language).catch(() => [{ lang: language, title }]),
		[title, language],
	);
}

export function usePageData(title: string, language: Locale) {
	// A missing article is a view of its own, not a reason to drop the reader's
	// history: the page keeps the error and lets the reader step back.
	const { data: page, isLoading: isLoadingPage, error } = usePageSummary(title, language);
	const { data: content, isLoading: isLoadingContent } = usePageContent(title, language);
	const { data: metadata, isLoading: isLoadingMetadata } = usePageMetadata(title, language);
	const { data: links, isLoading: isLoadingLinks } = usePageLinks(title, language);

	const isLoading = isLoadingPage || isLoadingContent || isLoadingMetadata || isLoadingLinks;

	return { page, content, metadata, links, isLoading, error };
}
