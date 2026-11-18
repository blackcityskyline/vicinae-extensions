import { popToRoot, showToast, Toast } from "@vicinae/api";
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

export function usePageSummary(title: string, language: Locale, onError?: (error: Error) => void) {
	return useFetch<PageSummary>(`${apiBase(language)}api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
		headers: requestHeaders(language),
		onError,
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
	const { data: page, isLoading: isLoadingPage } = usePageSummary(title, language, () => {
		showToast({
			title: "Page not found",
			message: title,
			style: Toast.Style.Failure,
		});
		popToRoot();
	});
	const { data: content, isLoading: isLoadingContent } = usePageContent(title, language);
	const { data: metadata, isLoading: isLoadingMetadata } = usePageMetadata(title, language);
	const { data: links, isLoading: isLoadingLinks } = usePageLinks(title, language);

	const isLoading = isLoadingPage || isLoadingContent || isLoadingMetadata || isLoadingLinks;

	return { page, content, metadata, links, isLoading };
}
