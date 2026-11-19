import type { RawSlang } from "~/api/urban";
import { escapeMarkdown } from "~/utils/senses";

/**
 * One Urban Dictionary definition: the text, the example someone wrote for it
 * and who wrote it. Votes are dropped: the endpoint has answered `0` for every
 * record since the service removed them, so a number here would be a lie.
 */
export type Slang = {
	word: string;
	definition: string;
	example?: string;
	author?: string;
	writtenOn?: string;
	permalink?: string;
};

/** UD marks its cross-links with brackets: `spitting [game]` reads `spitting game`. */
function unlink(text: string | undefined): string {
	return (text ?? "")
		.replace(/[[\]]/g, "")
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+/g, " ")
		.trim();
}

/** The endpoint answers newest-first by its own relevance, so the order is kept. */
export function parseSlang(entries: RawSlang[], asked: string): Slang[] {
	const slang: Slang[] = [];
	for (const entry of entries) {
		const definition = unlink(entry.definition);
		if (definition === "") continue;

		const example = unlink(entry.example);
		const author = unlink(entry.author);
		const writtenOn = unlink(entry.written_on).slice(0, 10);
		slang.push({
			word: unlink(entry.word) || asked,
			definition,
			...(example ? { example } : {}),
			...(author ? { author } : {}),
			...(writtenOn ? { writtenOn } : {}),
			...(entry.permalink ? { permalink: entry.permalink } : {}),
		});
	}
	return slang;
}

/** The pane: the definition, the example quoted, then who wrote it and when. */
export function slangMarkdown(slang: Slang): string {
	const lines: string[] = [`# ${escapeMarkdown(slang.word)}`, ""];
	for (const paragraph of slang.definition.split("\n")) {
		const text = paragraph.trim();
		if (text !== "") lines.push(escapeMarkdown(text), "");
	}
	if (slang.example) {
		for (const line of slang.example.split("\n")) {
			const text = line.trim();
			if (text !== "") lines.push(`> ${escapeMarkdown(text)}`);
		}
		lines.push("");
	}

	const by = [slang.author, slang.writtenOn].filter((part) => part !== undefined && part !== "");
	if (by.length > 0) lines.push(`_${escapeMarkdown(by.join(" · "))}_`);

	return lines.join("\n").trimEnd();
}
