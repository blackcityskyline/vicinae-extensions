import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { ArticleSection } from "~/components/article-section";
import type { WikiNode } from "~/utils/api";
import { keywordsOf, previewOf } from "~/utils/article-search";
import { sectionNodes } from "~/utils/formatting";
import type { Locale } from "~/utils/language";

/**
 * The reader has no way to search its own text: a `Detail` scrolls and nothing
 * else. This is the article's sections as a filterable list, each opening as the
 * section view, with the body words as keywords.
 */
export function ArticleSearch({
	content,
	links,
	language,
	title,
}: {
	content: WikiNode[];
	links: string[];
	language: Locale;
	title: string;
}) {
	const sections = sectionNodes(content);

	return (
		<List navigationTitle="Find in Article" searchBarPlaceholder="Search this article…">
			{sections.map((node) => (
				<List.Item
					key={node.title}
					id={node.title}
					title={node.title}
					subtitle={previewOf(node)}
					keywords={[node.title, ...keywordsOf(node)]}
					icon={Icon.BulletPoints}
					actions={
						<ActionPanel>
							<Action.Push
								title="Open Section"
								shortcut="open"
								target={<ArticleSection node={node} links={links} language={language} title={title} />}
							/>
							<Action.CopyToClipboard shortcut="copy" title="Copy Section" content={node.content} />
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
