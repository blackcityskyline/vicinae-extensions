import { environment } from "@vicinae/api";
import wiki from "wikijs";

import { apiBase, languageHeaders } from "~/utils/language";

export interface PageSummary {
	title: string;
	extract: string;
	description: string;
	thumbnail: {
		source: string;
	};
	content_urls: {
		desktop: {
			page: string;
		};
	};
}

export interface WikiNode {
	title: string;
	content: string;
	items?: WikiNode[];
}

export interface SearchResult {
	ns: number;
	title: string;
	pageid: number;
	size: number;
	wordcount: number;
	snippet: string;
	timestamp: string;
}

export interface SearchResults {
	query?: { search?: SearchResult[] };
}

export type PageMetadata = Record<string, unknown>;

/**
 * Wikimedia asks every client to identify itself with a name and a contact, and
 * blocks the anonymous Node default. The version is the launcher's, not Raycast's.
 */
const USER_AGENT = { "User-Agent": `Vicinae/${environment.vicinaeVersion.tag} (https://vicinae.com)` };

export function requestHeaders(language: string): Record<string, string> {
	return { ...USER_AGENT, ...languageHeaders(language) };
}

async function getJson<T>(url: string, language: string, timeout = 15_000): Promise<T> {
	const response = await fetch(url, { headers: requestHeaders(language), signal: AbortSignal.timeout(timeout) });
	if (!response.ok) throw new Error(`Wikipedia answered HTTP ${response.status} for ${url}`);
	return (await response.json()) as T;
}

export async function getRandomPageUrl(language: string) {
	const page = await getJson<PageSummary>(`${apiBase(language)}api/rest_v1/page/random/summary`, language);
	return { url: page.content_urls.desktop.page, title: page.title };
}

export async function getTodayFeaturedPageUrl(language: string) {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	const feed = await getJson<{ tfa: PageSummary }>(
		`${apiBase(language)}api/rest_v1/feed/featured/${year}/${month}/${day}`,
		language,
	);
	return { url: feed.tfa.content_urls.desktop.page, title: feed.tfa.title };
}

export function getPageData(title: string, language: string) {
	return getJson<PageSummary>(
		`${apiBase(language)}api/rest_v1/page/summary/${encodeURIComponent(title)}`,
		language,
	);
}

export async function searchPages(query: string, language: string, limit = 5) {
	const url = new URL(`${apiBase(language)}w/api.php`);
	url.searchParams.set("action", "query");
	url.searchParams.set("list", "search");
	url.searchParams.set("format", "json");
	url.searchParams.set("srsearch", query);
	url.searchParams.set("srlimit", String(limit));
	const data = await getJson<SearchResults>(url.toString(), language);
	return data.query?.search ?? [];
}

function getWikiPage(title: string, language: string) {
	return wiki({ apiUrl: `${apiBase(language)}w/api.php`, headers: requestHeaders(language) }).page(title);
}

export async function getPageMetadata(title: string, language: string) {
	return getWikiPage(title, language).then((page) => page.fullInfo());
}

export function getPageContent(title: string, language: string) {
	return getWikiPage(title, language)
		.then((page) => page.content())
		.then((result) => result as unknown as WikiNode[]);
}

export function getPageLinks(title: string, language: string) {
	return getWikiPage(title, language)
		.then((page) => page.links())
		.catch(() => [] as string[]);
}

export function getPageLangLinks(title: string, language: string) {
	return getWikiPage(title, language).then((page) => page.langlinks());
}
