import { apiBase } from "~/utils/language";

/**
 * A deeplink carries no command arguments, so the title rides in `fallbackText`,
 * the one query parameter the launcher forwards (docs.vicinae.com/deeplinks).
 * The author and extension slug come from the manifest; they move together.
 */
const ARTICLE_DEEPLINK = "vicinae://launch/@black/wikipedia/open-page";

/** The article on Wikipedia itself. */
export function browserPageLink(title: string, language: string): string {
	return `${apiBase(language)}wiki/${encodeURIComponent(title)}`;
}

/** The article inside the launcher, from a link in another article. */
export function launcherPageLink(title: string): string {
	return `${ARTICLE_DEEPLINK}?fallbackText=${encodeURIComponent(title)}`;
}

export function browserSearchLink(query: string, language: string): string {
	const params = new URLSearchParams({
		fulltext: "1",
		profile: "advanced",
		search: query,
		title: "Special:Search",
		ns0: "1",
	});
	return `${apiBase(language)}w/index.php?${params.toString()}`;
}

/** Where a link in an article body leads, depending on the "Open In" preference. */
export function pageLink(title: string, language: string, openInBrowser: boolean): string {
	return openInBrowser ? browserPageLink(title, language) : launcherPageLink(title);
}
