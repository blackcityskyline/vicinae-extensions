import { Action, ActionPanel, Detail, Icon, useNavigation } from "@vicinae/api";
import { useCachedState } from "@raycast/utils";
import dedent from "dedent";
import { Fragment, useEffect, useRef, useState } from "react";

import { ChangeLanguageSubmenu } from "~/components/change-language-submenu";
import { usePageData } from "~/hooks/usePageData";
import {
	formatMetadataValue,
	processMetadata,
	renderContent,
	replaceLinks,
	toSentenceCase,
	toTitleCase,
} from "~/utils/formatting";
import { reduceHistory, type HistoryAction, type HistoryState } from "~/utils/history";
import type { Locale } from "~/utils/language";
import { browserPageLink } from "~/utils/links";
import { opensInBrowser } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

export default function WikipediaPage({ title, language }: { title: string; language: Locale }) {
	const { pop } = useNavigation();
	const { addToReadArticles } = useRecentArticles();
	const [showMetadata, setShowMetadata] = useCachedState("showMetadata", false);
	const [history, setHistory] = useState<HistoryState>({
		entries: [{ title, language }],
		index: 0,
	});
	const historyRef = useRef(history);

	const current = history.entries[history.index] ?? { title, language };

	const { page, content, metadata, links, isLoading } = usePageData(current.title, current.language);

	useEffect(() => {
		addToReadArticles({ title: current.title, language: current.language });
	}, [current.title, current.language]);

	function applyHistory(action: HistoryAction) {
		// Apply against the pending snapshot so rapid actions don't use a stale render-time index.
		const next = reduceHistory(historyRef.current, action);
		historyRef.current = next;
		setHistory(next);
	}

	function goBack() {
		if (historyRef.current.index === 0) {
			pop();
			return;
		}

		applyHistory({ type: "back" });
	}

	function goForward() {
		applyHistory({ type: "forward" });
	}

	function navigate(nextTitle: string, nextLanguage: Locale) {
		applyHistory({ type: "navigate", title: nextTitle, language: nextLanguage });
	}

	const body = content ? renderContent(content, 2, links, current.language, opensInBrowser) : "";

	const markdown = page
		? dedent`
  # ${page.title}

  ${page.description ? `>${toSentenceCase(page.description)}\n\n` : ""}

  ${replaceLinks(page.extract, current.language, links, opensInBrowser)}

  ${page.thumbnail?.source ? `![](${page.thumbnail.source})` : ""}

  ${body ? "---" : ""}

  ${body}`
		: "";

	return (
		<Detail
			navigationTitle={current.title}
			isLoading={isLoading}
			markdown={markdown}
			metadata={
				showMetadata ? (
					<Detail.Metadata>
						{processMetadata(metadata).map(({ key, title, value }) => {
							if (Array.isArray(value)) {
								if (value.length === 0) return null;

								const first = value[0] as { date?: string; location?: string } | undefined;
								if (first?.date) {
									return (
										<Fragment key={key}>
											<Detail.Metadata.TagList title={`${title} (Date)`}>
												{value.filter(Boolean).map((item: { date?: string }) => (
													<Detail.Metadata.TagList.Item key={item.date} text={item.date} />
												))}
											</Detail.Metadata.TagList>
											{first.location && (
												<Detail.Metadata.TagList title={`${title} (Location)`}>
													{value.filter(Boolean).map((item: { location?: string }) => (
														<Detail.Metadata.TagList.Item key={item.location} text={item.location} />
													))}
												</Detail.Metadata.TagList>
											)}
										</Fragment>
									);
								}

								return (
									<Detail.Metadata.TagList key={key} title={title}>
										{value.map((item, index) => (
											<Detail.Metadata.TagList.Item key={`${item}-${index}`} text={formatMetadataValue(key, item)} />
										))}
									</Detail.Metadata.TagList>
								);
							}

							if (value instanceof Object) {
								return (
									<Fragment key={key}>
										{Object.entries(value).map(([field, fieldValue]) => (
											<Detail.Metadata.Label
												key={field}
												title={`${title} (${toTitleCase(field)})`}
												text={formatMetadataValue(field, fieldValue as string)}
											/>
										))}
									</Fragment>
								);
							}

							if (typeof value !== "string") {
								return null;
							}

							return <Detail.Metadata.Label key={key} title={title} text={formatMetadataValue(key, value)} />;
						})}
					</Detail.Metadata>
				) : null
			}
			actions={
				<ActionPanel>
					{page?.content_urls && (
						<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={page.content_urls.desktop.page} />
					)}
					<Action
						icon={Icon.AppWindowSidebarRight}
						title={showMetadata ? "Hide Metadata" : "Show Metadata"}
						shortcut={{ modifiers: ["ctrl"], key: "m" }}
						onAction={() => setShowMetadata(!showMetadata)}
					/>
					<ChangeLanguageSubmenu title={current.title} language={current.language} onSelect={navigate} />
					<ActionPanel.Section>
						<Action icon={Icon.ArrowLeft} title="Back" shortcut={{ modifiers: ["alt"], key: "arrowLeft" }} onAction={goBack} />
						<Action icon={Icon.ArrowRight} title="Forward" shortcut={{ modifiers: ["alt"], key: "arrowRight" }} onAction={goForward} />
					</ActionPanel.Section>
					<ActionPanel.Section>
						{page?.content_urls && (
							<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={page.content_urls.desktop.page} />
						)}
						<Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={current.title} />
						<Action.CopyToClipboard shortcut="copy-path" title="Copy Subtitle" content={page?.description ?? ""} />
						<Action.CopyToClipboard
							shortcut={{ modifiers: ["ctrl", "alt"], key: "s" }}
							title="Copy Summary"
							content={page?.extract ?? ""}
						/>
						<Action.CopyToClipboard
							shortcut={{ modifiers: ["ctrl", "alt"], key: "c" }}
							title="Copy Contents"
							content={body}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section>
						<ActionPanel.Submenu title="Open Link" icon={Icon.AppWindow} shortcut={{ modifiers: ["ctrl"], key: "l" }}>
							{links?.map((link: string) =>
								opensInBrowser ? (
									<Action.OpenInBrowser
										key={link}
										title={link}
										url={browserPageLink(link, current.language)}
									/>
								) : (
									<Action title={link} key={link} onAction={() => navigate(link, current.language)} />
								),
							)}
						</ActionPanel.Submenu>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
