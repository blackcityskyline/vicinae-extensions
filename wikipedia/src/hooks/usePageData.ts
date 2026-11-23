import { useCachedPromise, useFetch } from "@raycast/utils";

import {
	getCategoryMembers,
	getPageCategories,
	getPageContent,
	getPageInfo,
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

/**
 * The infobox is a wikitext parse, the most expensive request of the reader, and
 * only the metadata bar shows it: it is not asked for while the bar is hidden.
 */
function usePageMetadata(title: string, language: Locale, enabled: boolean) {
	return useCachedPromise(
		(title: string, language: Locale) =>
			getPageMetadata(title, language)
				.then((data) => ((data as { general?: PageMetadata }).general ?? {}) as PageMetadata)
				.catch(() => ({})),
		[title, language],
		{ execute: enabled },
	);
}

/** Page id, size, last edit and Wikidata item: one request, infobox or not. */
function usePageInfo(title: string, language: Locale) {
	return useCachedPromise((title: string, language: Locale) => getPageInfo(title, language), [title, language], {
		execute: Boolean(title),
	});
}

function usePageLinks(title: string, language: Locale) {
	return useCachedPromise((title: string, language: Locale) => getPageLinks(title, language), [title, language]);
}

/** Asked for when the categories view opens: reading an article does not need them. */
export function usePageCategories(title: string, language: Locale) {
	return useCachedPromise(
		(title: string, language: Locale) => getPageCategories(title, language).catch(() => [] as string[]),
		[title, language],
	);
}

export function useCategoryMembers(category: string, language: Locale) {
	return useCachedPromise(
		(category: string, language: Locale) => getCategoryMembers(category, language).catch(() => [] as string[]),
		[category, language],
	);
}

export function useAvailableLanguages(title: string, language: Locale) {
	return useCachedPromise(
		(title: string, language: Locale) => getPageLangLinks(title, language).catch(() => [{ lang: language, title }]),
		[title, language],
	);
}

export function usePageData(title: string, language: Locale, withMetadata = true) {
	// A missing article is a view of its own, not a reason to drop the reader's
	// history: the page keeps the error and lets the reader step back.
	const { data: page, isLoading: isLoadingPage, error } = usePageSummary(title, language);
	const { data: content, isLoading: isLoadingContent } = usePageContent(title, language);
	const { data: metadata, isLoading: isLoadingMetadata } = usePageMetadata(title, language, withMetadata);
	const { data: info, isLoading: isLoadingInfo } = usePageInfo(title, language);
	const { data: links, isLoading: isLoadingLinks } = usePageLinks(title, language);

	const isLoading = isLoadingPage || isLoadingContent || isLoadingMetadata || isLoadingLinks || isLoadingInfo;

	return { page, content, metadata, links, info, isLoading, error };
}
