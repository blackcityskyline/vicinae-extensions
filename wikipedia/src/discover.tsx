import { Action, ActionPanel, Icon, List, Toast, environment, showToast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";

import { useLanguage } from "~/api/language";
import WikipediaPage from "~/components/wikipedia-page";
import { configureInk } from "~/lib/cards";
import { themeInk } from "~/lib/theme";
import { getFeaturedFeed } from "~/utils/api";
import { discoverSections } from "~/utils/discover";
import { errorText } from "~/utils/error";
import { languages, type Locale } from "~/utils/language";
import { browserPageLink } from "~/utils/links";
import { opensInBrowser } from "~/utils/preferences";

configureInk(themeInk(environment.appearance));

/**
 * Today on Wikipedia: the featured article, the picture of the day, what
 * happened on this date and what everyone else is reading. One request; the feed
 * carries all four.
 */
export default function DiscoverPage() {
	const [language, setLanguage] = useLanguage();
	const { data, isLoading, error } = useCachedPromise(getFeaturedFeed, [language], {
		onError: (cause) => {
			void showToast({ style: Toast.Style.Failure, title: "Could not load today's feed", message: errorText(cause) });
		},
	});

	return (
		<List
			isLoading={isLoading}
			navigationTitle="Discover"
			searchBarPlaceholder="Filter today's feed…"
			searchBarAccessory={
				<List.Dropdown tooltip="Language" value={language} onChange={(value) => setLanguage(value as Locale)}>
					{languages.map((entry) => (
						<List.Dropdown.Item key={entry.value} icon={entry.icon} title={entry.title} value={entry.value} />
					))}
				</List.Dropdown>
			}
		>
			{error && !data ? (
				<List.EmptyView title="Nothing to show" description={errorText(error)} />
			) : (
				discoverSections(data).map((section) => (
					<List.Section key={section.title} title={section.title}>
						{section.rows.map((row) => (
							<List.Item
								key={row.key}
								id={row.key}
								title={row.title}
								subtitle={row.subtitle}
								keywords={[row.title, row.subtitle ?? ""]}
								icon={row.thumbnail ? { source: row.thumbnail } : Icon.Globe01}
								actions={
									<ActionPanel>
										{row.read ? (
											opensInBrowser ? (
												<>
													<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(row.read, language)} />
													<Action.Push
														icon={Icon.AppWindow}
														title="Read Article"
														shortcut={{ modifiers: ["ctrl"], key: "d" }}
														target={<WikipediaPage title={row.read} language={language} />}
													/>
												</>
											) : (
												<>
													<Action.Push
														icon={Icon.AppWindow}
														title="Read Article"
														shortcut="open"
														target={<WikipediaPage title={row.read} language={language} />}
													/>
													<Action.OpenInBrowser
														title="Open in Browser"
														shortcut={{ modifiers: ["ctrl"], key: "d" }}
														url={browserPageLink(row.read, language)}
													/>
												</>
											)
										) : null}
										{row.url ? <Action.OpenInBrowser icon={Icon.Image} title="Open Picture" url={row.url} /> : null}
										{row.read ? (
											<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={browserPageLink(row.read, language)} />
										) : null}
									</ActionPanel>
								}
							/>
						))}
					</List.Section>
				))
			)}
		</List>
	);
}
