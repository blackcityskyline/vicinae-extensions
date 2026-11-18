import dedent from "dedent";

import { storedLanguage } from "~/api/language";
import {
	getPageContent,
	getPageData,
	getPageLinks,
	getPageMetadata,
	searchPages,
} from "~/utils/api";
import { renderContent, replaceLinks } from "~/utils/formatting";
import type { Locale } from "~/utils/language";

type Input = {
	/** What to look up on Wikipedia, as the user asked it. */
	query: string;
	/** Wiki language code, such as "en" or "be". Omit it to use the language last picked in the launcher. */
	language?: Locale;
};

/**
 * Search Wikipedia and read the article that matches best. Returns the article as markdown plus the titles of the other articles the same query found, which are worth a second search when the first article does not answer the question.
 */
export default async function (input: Input) {
	const language = input.language ?? (await storedLanguage());
	const pages = await searchPages(input.query, language);
	const [best, ...rest] = pages;

	if (!best) {
		return { title: "", content: `No Wikipedia article matches "${input.query}" in ${language}.`, results: [] };
	}

	const title = best.title;
	const [page, metadata, content, links] = await Promise.all([
		getPageData(title, language),
		getPageMetadata(title, language),
		getPageContent(title, language),
		getPageLinks(title, language),
	]);

	const body = content ? renderContent(content, 2, links, language) : "";
	const markdown = page
		? dedent`
			# ${page.title}

			${replaceLinks(page.extract, language, links)}

			${body.slice(0, 300_000)}
		`
		: "";

	return {
		title,
		metadata,
		content: markdown,
		results: rest.map((result) => result.title),
	};
}
