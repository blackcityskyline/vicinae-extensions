/**
 * `prop=categories` and `list=categorymembers`, turned into titles. Pure: the
 * requests live in `~/utils/api.ts`, so the self-checks can read a recorded body.
 */

export interface WireCategories {
	query?: { pages?: { categories?: { ns?: number; title?: string }[] }[] };
}

export interface WireCategoryMembers {
	query?: { categorymembers?: { ns?: number; title?: string }[] };
}

/** "Категория:Квантовая физика" is a namespace plus a name; a list shows the name. */
export function stripNamespace(title: string): string {
	const colon = title.indexOf(":");
	return colon > 0 ? title.slice(colon + 1) : title;
}

/** The categories of one article, in the order the API returns them. */
export function readCategories(answer: WireCategories): string[] {
	const page = answer.query?.pages?.[0];
	return (page?.categories ?? [])
		.map((category) => category.title?.trim())
		.filter((title): title is string => Boolean(title));
}

/**
 * The articles of one category. Pages in other namespaces (files, templates) are
 * not readable as articles, so only namespace 0 is asked for.
 */
export function readCategoryMembers(answer: WireCategoryMembers): string[] {
	return (answer.query?.categorymembers ?? [])
		.filter((member) => member.ns === 0)
		.map((member) => member.title?.trim())
		.filter((title): title is string => Boolean(title));
}
