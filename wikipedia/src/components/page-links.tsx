import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import WikipediaPage from "~/components/wikipedia-page";
import type { Locale } from "~/utils/language";
import { browserPageLink } from "~/utils/links";
import { opensInBrowser } from "~/utils/preferences";

/**
 * The links of an article as a list of their own: a submenu cannot be searched,
 * and an article can link a few hundred titles. Vicinae filters the rows from the
 * search bar, so nothing here asks the network again.
 */
export function PageLinks({ links, language }: { links: string[]; language: Locale }) {
	return (
		<List searchBarPlaceholder="Filter links…" navigationTitle="Links">
			{links.map((title) => (
				<List.Item
					key={title}
					id={title}
					title={title}
					icon={Icon.Link}
					actions={
						<ActionPanel>
							{opensInBrowser ? (
								<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(title, language)} />
							) : (
								<Action.Push
									title="Read Article"
									shortcut="open"
									target={<WikipediaPage title={title} language={language} />}
								/>
							)}
							<Action.CopyToClipboard shortcut="copy-name" title="Copy Title" content={title} />
							<Action.CopyToClipboard shortcut="copy" title="Copy URL" content={browserPageLink(title, language)} />
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
