import { Action, ActionPanel, Detail, Icon, useNavigation } from "@vicinae/api";

import type { WikiNode } from "~/utils/api";
import { renderContent } from "~/utils/formatting";
import { browserPageLink } from "~/utils/links";
import type { Locale } from "~/utils/language";
import { opensInBrowser } from "~/utils/preferences";

/**
 * One section of an article on its own: the reader has no way to scroll to an
 * anchor, so "jump" is a view with that section's text, links included.
 */
export function ArticleSection({ node, links, language, title }: { node: WikiNode; links: string[]; language: Locale; title: string }) {
	const { pop } = useNavigation();

	return (
		<Detail
			navigationTitle={node.title}
			markdown={renderContent([node], 1, links, language, opensInBrowser)}
			actions={
				<ActionPanel>
					<Action.OpenInBrowser title="Open in Browser" shortcut="open" url={browserPageLink(title, language)} />
					<Action icon={Icon.ArrowLeft} title="Back" shortcut={{ modifiers: ["alt"], key: "arrowLeft" }} onAction={pop} />
					<Action.CopyToClipboard shortcut="copy-name" title="Copy Section" content={node.content} />
				</ActionPanel>
			}
		/>
	);
}
