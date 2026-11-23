/**
 * What "Find in Article" searches: the sections of an article, each with the
 * words of its body, so a heading is not the only way to find a passage. Pure,
 * so the self-checks can feed it a parsed article.
 */

import type { WikiNode } from "~/utils/api";

/** The words a section reads by: unique, lower-cased, a word of two letters dropped. */
export function keywordsOf(node: WikiNode, limit = 60): string[] {
	const words = node.content.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];
	return [...new Set(words)].slice(0, limit);
}

/** A section's text as one line, long enough to recognise it and short enough to read. */
export function previewOf(node: WikiNode, limit = 140): string {
	const text = node.content.replace(/\s+/g, " ").trim();
	return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
