import { Action, ActionPanel, Grid, Icon, List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";

import WikipediaPage from "~/components/wikipedia-page";
import { getPageData } from "~/utils/api";
import { toSentenceCase } from "~/utils/formatting";
import type { Locale } from "~/utils/language";
import { browserSearchLink } from "~/utils/links";
import { opensInBrowser, prefersListView } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

const FALLBACK_ICON = { source: "wikipedia.png" } as const;

export function PageItem({ search, title, language }: { search: string; title: string; language: Locale }) {
	const { data: page } = useCachedPromise(getPageData, [title, language]);
	const { clearReadArticles, removeFromReadArticles } = useRecentArticles();

	const picture = page?.thumbnail?.source || Icon.Image;
	const badge = page?.thumbnail?.source || FALLBACK_ICON;
	const actions = (
		<ActionPanel>
			{page?.content_urls &&
				(opensInBrowser ? (
					<>
						<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={page.content_urls.desktop.page} />
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
						<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={page.content_urls.desktop.page} />
					</>
				))}
			<Action.OpenInBrowser
				title="Search in Browser"
				shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
				url={browserSearchLink(search, language)}
			/>
			<ActionPanel.Section>
				{page?.content_urls && (
					<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={page.content_urls.desktop.page} />
				)}
				{page?.content_urls && <Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={title} />}
				<Action.CopyToClipboard shortcut="copy-path" title="Copy Subtitle" content={page?.description ?? ""} />
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

	const subtitle = page?.description ? toSentenceCase(page.description) : "";
	const keywords = [title, page?.description ?? "", language];

	return prefersListView ? (
		<List.Item id={title} title={title} subtitle={subtitle} keywords={keywords} icon={picture} actions={actions} />
	) : (
		<Grid.Item
			id={title}
			title={title}
			subtitle={subtitle}
			keywords={keywords}
			content={picture}
			icon={badge}
			actions={actions}
		/>
	);
}
