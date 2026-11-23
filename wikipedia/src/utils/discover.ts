/**
 * Today's feed, laid out as rows. The feed mixes three shapes — a summary, a
 * picture and an event — and titles arrive with underscores, so the rows are
 * built here, away from the view and the network.
 */

import type { FeaturedFeed } from "~/utils/api";

export type DiscoverRow = {
	key: string;
	title: string;
	subtitle?: string;
	thumbnail?: string;
	/** The article this row opens, when it is an article. */
	read?: string;
	/** Something to open in the browser: the picture's file page. */
	url?: string;
};

export type DiscoverSection = { title: string; rows: DiscoverRow[] };

/** Feed titles keep the wiki's underscores; a row reads them as spaces. */
export function plainTitle(title: string): string {
	return title.replace(/_/g, " ").trim();
}

export function discoverSections(feed: FeaturedFeed | undefined): DiscoverSection[] {
	if (!feed) return [];
	const sections: DiscoverSection[] = [];

	if (feed.tfa?.title) {
		sections.push({
			title: "Featured Article",
			rows: [
				{
					key: "tfa",
					title: plainTitle(feed.tfa.title),
					subtitle: feed.tfa.description,
					thumbnail: feed.tfa.thumbnail?.source,
					read: plainTitle(feed.tfa.title),
				},
			],
		});
	}

	if (feed.image?.thumbnail?.source) {
		sections.push({
			title: "Picture of the Day",
			rows: [
				{
					key: "image",
					title: feed.image.title ? plainTitle(feed.image.title) : "Picture of the day",
					subtitle: feed.image.description?.text,
					thumbnail: feed.image.thumbnail.source,
					...(feed.image.file_page ? { url: feed.image.file_page } : {}),
				},
			],
		});
	}

	const anniversaries = (feed.onthisday ?? []).flatMap((event, index) => {
		const page = event.pages?.[0];
		if (!page?.title && !event.text) return [];
		return [
			{
				key: `day-${index}`,
				title: page?.title ? plainTitle(page.title) : (event.text ?? "").slice(0, 60),
				subtitle: [event.year ? String(event.year) : "", event.text ?? ""].filter(Boolean).join(" — "),
				...(page?.thumbnail?.source ? { thumbnail: page.thumbnail.source } : {}),
				...(page?.title ? { read: plainTitle(page.title) } : {}),
			},
		];
	});
	if (anniversaries.length > 0) sections.push({ title: "On This Day", rows: anniversaries });

	const mostRead = (feed.mostread?.articles ?? []).flatMap((article, index) => {
		const title = article.normalizedtitle ?? plainTitle(article.title ?? "");
		if (!title) return [];
		return [
			{
				key: `read-${index}`,
				title,
				subtitle: article.description ?? article.extract?.slice(0, 120),
				...(article.thumbnail?.source ? { thumbnail: article.thumbnail.source } : {}),
				read: title,
			},
		];
	});
	if (mostRead.length > 0) sections.push({ title: "Most Read", rows: mostRead });

	return sections;
}
