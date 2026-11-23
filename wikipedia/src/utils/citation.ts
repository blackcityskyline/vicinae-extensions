/**
 * A reference to an article in the shape the "Cite this page" page of Wikipedia
 * prints it, cut to what the reader has: the title, the URL and the dates.
 * Pure, so the self-check can compare the whole sentence.
 */
export function citationOf({
	title,
	url,
	edited,
	retrieved,
}: {
	title: string;
	url: string;
	/** Last edit, already written out in the article's language. */
	edited?: string;
	/** Today, already written out in the article's language. */
	retrieved: string;
}): string {
	// A localized date may end with its own period ("22 нояб. 2026 г."): one, not two.
	const lastEdited = edited ? ` Last edited ${edited.replace(/\.$/, "")}.` : "";
	return `"${title}." Wikipedia, The Free Encyclopedia.${lastEdited} Retrieved ${retrieved}, from ${url}`;
}
