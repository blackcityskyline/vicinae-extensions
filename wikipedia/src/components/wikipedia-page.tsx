import { Action, ActionPanel, Detail, Icon, useNavigation } from "@vicinae/api";
import { useCachedState } from "@raycast/utils";
import dedent from "dedent";
import { Fragment, useEffect, useRef, useState } from "react";

import { rememberSummary } from "~/api/summaries";
import { ArticleList } from "~/components/article-list";
import { ArticleSearch } from "~/components/article-search";
import { ArticleSection } from "~/components/article-section";
import { ChangeLanguageSubmenu } from "~/components/change-language-submenu";
import { PageCategories } from "~/components/page-categories";
import { usePageData } from "~/hooks/usePageData";
import { useBookmarks } from "~/api/bookmarks";
import { citationOf } from "~/utils/citation";
import {
	formatDate,
	formatMetadataValue,
	formatSize,
	processMetadata,
	renderContent,
	replaceLinks,
	sectionNodes,
	toSentenceCase,
	toTitleCase,
} from "~/utils/formatting";
import { reduceHistory, type HistoryAction, type HistoryState } from "~/utils/history";
import { languages, type Locale } from "~/utils/language";
import { browserPageLink, browserSearchLink } from "~/utils/links";
import { opensInBrowser } from "~/utils/preferences";
import { useRecentArticles } from "~/utils/recents";

export default function WikipediaPage({ title, language }: { title: string; language: Locale }) {
	const { pop, push } = useNavigation();
	const { addToReadArticles } = useRecentArticles();
	const { isBookmarked, toggleBookmark } = useBookmarks();
	// The infobox is what most articles are opened for; the toggle hides it.
	const [showMetadata, setShowMetadata] = useCachedState("showMetadata", true);
	const [history, setHistory] = useState<HistoryState>({
		entries: [{ title, language }],
		index: 0,
	});
	const historyRef = useRef(history);

	const current = history.entries[history.index] ?? { title, language };
	const languageName = languages.find((entry) => entry.value === current.language)?.title ?? current.language;

	const { page, content, metadata, links, info, isLoading, error } = usePageData(
		current.title,
		current.language,
		showMetadata,
	);
	const sections = sectionNodes(content);
	const saved = isBookmarked(current.title);
	const citation = citationOf({
		title: current.title,
		url: browserPageLink(current.title, current.language),
		edited: info?.touched ? formatDate(info.touched, current.language) : undefined,
		retrieved: formatDate(new Date().toISOString(), current.language),
	});

	useEffect(() => {
		addToReadArticles({ title: current.title, language: current.language });
	}, [current.title, current.language]);

	// The recent list keeps titles only; the cover and the description come from here.
	useEffect(() => {
		if (!page) return;
		void rememberSummary(current.language, {
			title: page.title || current.title,
			description: page.description,
			thumbnail: page.thumbnail?.source,
		});
	}, [page, current.language, current.title]);

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

	if (!page && error) {
		return (
			<Detail
				navigationTitle={current.title}
				markdown={`# ${current.title || "No article"}\n\n${error.message}`}
				actions={
					<ActionPanel>
						<Action.OpenInBrowser title="Search in Browser" shortcut="open" url={browserSearchLink(current.title, current.language)} />
						<Action icon={Icon.ArrowLeft} title="Back" onAction={pop} />
						<Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={current.title} />
					</ActionPanel>
				}
			/>
		);
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
						{/* The facts every article has; the infobox follows when it has one. */}
						<Detail.Metadata.Label title="Language" text={languageName} />
						{info?.length ? <Detail.Metadata.Label title="Size" text={formatSize(info.length)} /> : null}
						{info?.touched ? <Detail.Metadata.Label title="Updated" text={formatDate(info.touched, current.language)} /> : null}
						{info?.wikibaseItem ? (
							<Detail.Metadata.Link
								title="Wikidata"
								text={info.wikibaseItem}
								target={`https://www.wikidata.org/wiki/${info.wikibaseItem}`}
							/>
						) : null}
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
					<Action
						icon={Icon.Bookmark}
						title={saved ? "Remove Bookmark" : "Bookmark"}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "b" }}
						onAction={() => toggleBookmark({ title: current.title, language: current.language })}
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
						<Action.CopyToClipboard
							shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
							title="Copy Citation"
							content={citation}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section>
						<Action.Push
							icon={Icon.AppWindow}
							title="Open Link"
							shortcut={{ modifiers: ["ctrl"], key: "l" }}
							target={
								<ArticleList
									titles={links ?? []}
									language={current.language}
									navigationTitle="Links"
									placeholder="Filter links…"
								/>
							}
						/>
						<Action.Push
							icon={Icon.Folder}
							title="Categories"
							shortcut={{ modifiers: ["ctrl"], key: "k" }}
							target={<PageCategories title={current.title} language={current.language} />}
						/>
						{content && content.length > 0 ? (
							<Action.Push
								icon={Icon.MagnifyingGlass}
								title="Find in Article"
								shortcut={{ modifiers: ["ctrl"], key: "f" }}
								target={
									<ArticleSearch
										content={content}
										links={links ?? []}
										language={current.language}
										title={current.title}
									/>
								}
							/>
						) : null}
						{sections.length > 0 ? (
							<ActionPanel.Submenu icon={Icon.BulletPoints} title="Sections" shortcut={{ modifiers: ["ctrl"], key: "s" }}>
								{sections.map((node) => (
									<Action
										key={node.title}
										title={node.title}
										onAction={() =>
											push(
												<ArticleSection
													node={node}
													links={links ?? []}
													language={current.language}
													title={current.title}
												/>,
											)
										}
									/>
								))}
							</ActionPanel.Submenu>
						) : null}
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
