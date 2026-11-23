import { Action, ActionPanel, Icon, List, type Image } from "@vicinae/api";

import WikipediaPage from "~/components/wikipedia-page";
import { useBookmarks } from "~/api/bookmarks";
import type { Locale } from "~/utils/language";
import { browserPageLink } from "~/utils/links";
import { opensInBrowser } from "~/utils/preferences";

/**
 * Titles of articles as a list of their own, with Vicinae's own filter: links, a
 * category's members, anything that is a few hundred titles and cannot live in a
 * submenu. Nothing here asks the network; the caller already has the titles.
 */
export function ArticleList({
	titles,
	language,
	navigationTitle,
	placeholder,
	isLoading,
	icon = Icon.Link,
}: {
	titles: string[];
	language: Locale;
	navigationTitle: string;
	placeholder: string;
	isLoading?: boolean;
	icon?: Image.ImageLike;
}) {
	return (
		<List isLoading={isLoading} navigationTitle={navigationTitle} searchBarPlaceholder={placeholder}>
			{titles.length === 0 && !isLoading ? (
				<List.EmptyView title="Nothing to list" description="This article names none in this language." />
			) : null}
			{titles.map((title) => (
				<ArticleRow key={title} title={title} language={language} icon={icon} />
			))}
		</List>
	);
}

function ArticleRow({ title, language, icon }: { title: string; language: Locale; icon: Image.ImageLike }) {
	const { isBookmarked, toggleBookmark } = useBookmarks();
	const saved = isBookmarked(title);

	return (
		<List.Item
			id={title}
			title={title}
			icon={icon}
			actions={
				<ActionPanel>
					{opensInBrowser ? (
						<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(title, language)} />
					) : (
						<Action.Push title="Read Article" shortcut="open" target={<WikipediaPage title={title} language={language} />} />
					)}
					<Action
						icon={Icon.Bookmark}
						title={saved ? "Remove Bookmark" : "Bookmark"}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "b" }}
						onAction={() => toggleBookmark({ title, language })}
					/>
					<ActionPanel.Section>
						{opensInBrowser ? (
							<Action.Push title="Read Article" target={<WikipediaPage title={title} language={language} />} />
						) : (
							<Action.OpenInBrowser title="Open in Browser" url={browserPageLink(title, language)} />
						)}
						<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={browserPageLink(title, language)} />
						<Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={title} />
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
