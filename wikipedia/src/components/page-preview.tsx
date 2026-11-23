import { List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { usePageSummary } from "~/hooks/usePageData";
import { paneMarkdown, type Row } from "~/lib/cards";
import { artworkFor, type Artwork } from "~/utils/artwork";
import { toSentenceCase } from "~/utils/formatting";
import { languages, type Locale } from "~/utils/language";

function useArtwork(url: string | undefined): Artwork {
	const [art, setArt] = useState<Artwork>({ href: "" });

	useEffect(() => {
		let active = true;
		setArt({ href: "" });
		void artworkFor(url).then((found) => {
			if (active) setArt(found);
		});
		return () => {
			active = false;
		};
	}, [url]);

	return art;
}

/**
 * The preview pane of a search row: the picture in a card, then the facts, then
 * the first lines of the article. Drawn for the selected row only — every pane
 * of a list is mounted, so a pane per row would fetch a picture per row.
 *
 * `words` and `description` come from the search, the opening lines from the
 * article's summary, which is one request per selection.
 */
export function PagePreview({
	title,
	language,
	description,
	thumbnail,
	words,
}: {
	title: string;
	language: Locale;
	description?: string;
	thumbnail?: string;
	words?: number;
}) {
	const { data: summary } = usePageSummary(title, language);
	const art = useArtwork(thumbnail ?? summary?.thumbnail?.source);
	const languageName = languages.find((entry) => entry.value === language)?.title ?? language;

	const rows: Row[] = [["Language", languageName]];
	if (words !== undefined) rows.push(["Words", words.toLocaleString()]);

	const markdown = paneMarkdown(
		{
			title,
			subtitle: description ? toSentenceCase(description) : undefined,
			rows,
			...(summary?.extract ? { description: summary.extract } : {}),
		},
		art,
	);

	return <List.Item.Detail markdown={markdown} />;
}
