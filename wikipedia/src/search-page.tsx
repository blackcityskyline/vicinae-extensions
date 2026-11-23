import { Action, ActionPanel, Grid, List, environment } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { useLanguage } from "~/api/language";
import { readSummaries } from "~/api/summaries";
import { PageItem } from "~/components/page-item";
import { PagePreview } from "~/components/page-preview";
import useFindPagesByTitle from "~/hooks/useFindPagesByTitle";
import { configureInk } from "~/lib/cards";
import { themeInk } from "~/lib/theme";
import { useBookmarks } from "~/api/bookmarks";
import { languages, type Locale } from "~/utils/language";
import { browserSearchLink } from "~/utils/links";
import { prefersListView } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

configureInk(themeInk(environment.appearance));

/**
 * `Grid` and `List` take the same props here, so the preference picks the
 * component instead of duplicating the view. Vicinae's `List` has no top-level
 * `actions` prop, which is why "Search in Browser" lives on the rows.
 */
const View = (prefersListView ? List : Grid) as typeof List;

/** Fill is the upstream look; `List` has no `fit`, hence the spread. */
const gridFit = prefersListView ? {} : { fit: Grid.Fit.Fill };

export default function SearchPage(props: { arguments: Arguments.SearchPage }) {
	const [language, setLanguage] = useLanguage();
	const languageName = languages.find((entry) => entry.value === language)?.title ?? language;
	const [search, setSearch] = useState(props.arguments.title ?? "");
	const [selected, setSelected] = useState<string>();
	const { readArticles } = useRecentArticles();
	const { bookmarks } = useBookmarks();
	const { data: summaries } = useCachedPromise(readSummaries, [language]);

	const { data, isLoading } = useFindPagesByTitle(search, language);
	// Results for the previous language would otherwise linger while the new ones load.
	const found = data?.language === language ? data : undefined;
	const results = found?.rows ?? [];
	const suggestion = found?.suggestion;

	// The recent list keeps titles only; the covers and descriptions are the ones
	// remembered when the article was last opened.
	const shelf = (titles: string[]) =>
		titles.map((title) => ({
			title,
			subtitle: summaries?.[title]?.description,
			thumbnail: summaries?.[title]?.thumbnail,
		}));
	const saved = shelf(bookmarks);
	const recents = shelf(readArticles);

	const rowFor = ({ title, subtitle, thumbnail }: { title: string; subtitle?: string; thumbnail?: string }) => (
		<PageItem
			key={title}
			search={search}
			title={title}
			subtitle={subtitle}
			thumbnail={thumbnail}
			language={language}
			detail={
				title === selected ? (
					<PagePreview title={title} language={language} description={subtitle} thumbnail={thumbnail} />
				) : undefined
			}
		/>
	);

	return (
		<View
			throttle
			isLoading={isLoading}
			{...gridFit}
			{...(prefersListView ? { isShowingDetail: true, onSelectionChange: setSelected } : {})}
			searchText={search}
			onSearchTextChange={setSearch}
			searchBarPlaceholder="Search pages by name…"
			searchBarAccessory={
				<View.Dropdown tooltip="Language" value={language} onChange={(value) => setLanguage(value as Locale)}>
					{languages.map((entry) => (
						<View.Dropdown.Item key={entry.value} icon={entry.icon} title={entry.title} value={entry.value} />
					))}
				</View.Dropdown>
			}
		>
			{search && results.length === 0 && !isLoading ? (
				<View.EmptyView
					title="No pages found"
					description={`No Wikipedia article matches "${search}" in ${languageName}.`}
					actions={
						<ActionPanel>
							<Action.OpenInBrowser title="Search in Browser" shortcut="open" url={browserSearchLink(search, language)} />
							{suggestion ? (
								<Action title={`Search for “${suggestion}”`} onAction={() => setSearch(suggestion)} />
							) : null}
						</ActionPanel>
					}
				/>
			) : search ? (
				<View.Section title="Results">
					{results.map((result) => (
						<PageItem
							key={result.pageid}
							search={search}
							title={result.title}
							subtitle={result.description ?? result.snippet}
							thumbnail={result.thumbnail}
							language={language}
							detail={
								result.title === selected ? (
									<PagePreview
										title={result.title}
										language={language}
										description={result.description}
										thumbnail={result.thumbnail}
										words={result.words}
									/>
								) : undefined
							}
						/>
					))}
				</View.Section>
			) : (
				<>
					{saved.length > 0 ? (
						<View.Section title="Bookmarks">{saved.map(rowFor)}</View.Section>
					) : null}
					{recents.length > 0 ? (
						<View.Section title="Recent Articles">{recents.map(rowFor)}</View.Section>
					) : null}
					{saved.length === 0 && recents.length === 0 ? (
						<View.EmptyView
							title="Nothing read yet"
							description="Type to search Wikipedia; the articles you open land here."
						/>
					) : null}
				</>
			)}
		</View>
	);
}
