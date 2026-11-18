import { Action, ActionPanel, Grid, List } from "@vicinae/api";
import { useState } from "react";

import { useLanguage } from "~/api/language";
import { PageItem } from "~/components/page-item";
import useFindPagesByTitle from "~/hooks/useFindPagesByTitle";
import { languages, type Locale } from "~/utils/language";
import { browserSearchLink } from "~/utils/links";
import { prefersListView } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

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
	const { readArticles } = useRecentArticles();

	const { data, isLoading } = useFindPagesByTitle(search, language);
	// Results for the previous language would otherwise linger while the new ones load.
	const results = data?.language === language ? data.results : [];

	return (
		<View
			throttle
			isLoading={isLoading}
			{...gridFit}
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
					description={`No Wikipedia article is titled "${search}" in ${languageName}.`}
					actions={
						<ActionPanel>
							<Action.OpenInBrowser
								title="Search in Browser"
								shortcut="open"
								url={browserSearchLink(search, language)}
							/>
						</ActionPanel>
					}
				/>
			) : search ? (
				<View.Section title="Results">
					{results.map((result) => (
						<PageItem key={result.pageid} search={search} title={result.title} language={language} />
					))}
				</View.Section>
			) : (
				<View.Section title="Recent Articles">
					{readArticles.map((title) => (
						<PageItem key={title} search={search} title={title} language={language} />
					))}
				</View.Section>
			)}
		</View>
	);
}
