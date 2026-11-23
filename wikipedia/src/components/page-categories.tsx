import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { ArticleList } from "~/components/article-list";
import { useCategoryMembers, usePageCategories } from "~/hooks/usePageData";
import { stripNamespace } from "~/utils/categories";
import type { Locale } from "~/utils/language";

/**
 * The article's categories, then the articles inside one of them. Both views ask
 * for their own rows when opened: reading an article costs nothing here.
 */
export function PageCategories({ title, language }: { title: string; language: Locale }) {
	const { data, isLoading } = usePageCategories(title, language);

	return (
		<List isLoading={isLoading} navigationTitle="Categories" searchBarPlaceholder="Filter categories…">
			{(data ?? []).map((category) => (
				<List.Item
					key={category}
					id={category}
					title={stripNamespace(category)}
					icon={Icon.Folder}
					actions={
						<ActionPanel>
							<Action.Push
								title="Browse Category"
								shortcut="open"
								target={<CategoryMembers category={category} language={language} />}
							/>
							<Action.CopyToClipboard shortcut="copy-name" title="Copy Category" content={stripNamespace(category)} />
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}

function CategoryMembers({ category, language }: { category: string; language: Locale }) {
	const { data, isLoading } = useCategoryMembers(category, language);

	return (
		<ArticleList
			titles={data ?? []}
			isLoading={isLoading}
			language={language}
			navigationTitle={stripNamespace(category)}
			placeholder="Filter this category…"
			icon={Icon.Folder}
		/>
	);
}
