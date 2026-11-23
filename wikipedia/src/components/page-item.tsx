import { Action, ActionPanel, Grid, Icon, List } from "@vicinae/api";
import type { ReactNode } from "react";

import WikipediaPage from "~/components/wikipedia-page";
import { useBookmarks } from "~/api/bookmarks";
import { browserPageLink, browserSearchLink } from "~/utils/links";
import type { Locale } from "~/utils/language";
import { opensInBrowser, prefersListView } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

const FALLBACK_ICON = { source: "wikipedia.png" } as const;

/**
 * One search result or recent article. The picture and the description come from
 * the page query that found it, so a row costs no request of its own; `detail`
 * is the preview pane, drawn by the list for the selected row only.
 */
export function PageItem({
	search,
	title,
	language,
	subtitle,
	thumbnail,
	detail,
}: {
	search: string;
	title: string;
	language: Locale;
	subtitle?: string;
	thumbnail?: string;
	detail?: ReactNode;
}) {
	const { clearReadArticles, removeFromReadArticles } = useRecentArticles();
	const { isBookmarked, toggleBookmark } = useBookmarks();
	const saved = isBookmarked(title);
	const picture = thumbnail ? { source: thumbnail } : FALLBACK_ICON;

	const actions = (
		<ActionPanel>
			{opensInBrowser ? (
				<>
					<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(title, language)} />
					<Action.Push
						icon={Icon.AppWindow}
						title="Show Details"
						shortcut={{ modifiers: ["ctrl"], key: "d" }}
						target={<WikipediaPage title={title} language={language} />}
					/>
				</>
			) : (
				<>
					<Action.Push
						icon={Icon.AppWindow}
						title="Show Details"
						shortcut={{ modifiers: ["ctrl"], key: "d" }}
						target={<WikipediaPage title={title} language={language} />}
					/>
					<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(title, language)} />
				</>
			)}
			<Action
				icon={Icon.Bookmark}
				title={saved ? "Remove Bookmark" : "Bookmark"}
				shortcut={{ modifiers: ["ctrl", "shift"], key: "b" }}
				onAction={() => toggleBookmark({ title, language })}
			/>
			<Action.OpenInBrowser
				title="Search in Browser"
				shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
				url={browserSearchLink(search, language)}
			/>
			<ActionPanel.Section>
				<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={browserPageLink(title, language)} />
				<Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={title} />
				{subtitle ? <Action.CopyToClipboard shortcut="copy-path" title="Copy Subtitle" content={subtitle} /> : null}
			</ActionPanel.Section>
			<ActionPanel.Section>
				<Action
					title="Delete Recent Article"
					style={Action.Style.Destructive}
					shortcut="remove"
					icon={Icon.Trash}
					onAction={() => removeFromReadArticles({ title, language })}
				/>
				<Action
					title="Delete All Recent Articles"
					style={Action.Style.Destructive}
					shortcut="remove-all"
					icon={Icon.Trash}
					onAction={clearReadArticles}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);

	const keywords = [title, subtitle ?? "", language];

	return prefersListView ? (
		<List.Item id={title} title={title} subtitle={subtitle} keywords={keywords} icon={picture} detail={detail} actions={actions} />
	) : (
		<Grid.Item id={title} title={title} subtitle={subtitle} keywords={keywords} content={picture} icon={picture} actions={actions} />
	);
}
