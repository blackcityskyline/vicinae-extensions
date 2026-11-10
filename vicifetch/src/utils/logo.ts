import type { FastfetchModule } from "./spec";

/** fastfetch marks colour boundaries with `$1`-`$9` inside the logo text; a code block cannot use them. */
export function cleanLogoArt(lines: string): string {
	return lines
		.replace(/\$\d+/g, "")
		.split("\n")
		.map((line) => line.replace(/\s+$/, ""))
		.join("\n")
		.replace(/\n+$/, "");
}

/**
 * The art is left-aligned text; this padding centres it in the detail pane at
 * the default window size (the pane is ~457 px and the art ~266 px wide).
 */
const INDENT = "\u00a0".repeat(8);

/**
 * Inline HTML is passed through verbatim, so a monospace span gives clean art
 * without the code block's card and Copy header. The art is still parsed as
 * markdown between the tags, so the significant characters are backslash
 * escaped: `_`/`*` otherwise pair into emphasis and vanish, and `<` can open a
 * tag. Non-breaking spaces keep the indentation and the gaps between strokes.
 */
export function artMarkdown(art: string): string {
	const lines = art
		.split("\n")
		.map(
			(line) =>
				INDENT + line.replace(/[\\`*_<>&\[\]~]/g, "\\$&").replace(/ /g, "\u00a0"),
		);
	return `<span style="font-family:monospace;font-size:13px">${lines.join("<br/>")}</span>`;
}

/** The `Logo` module of the same fastfetch run that produced the facts. */
export function logoArt(modules: readonly FastfetchModule[]): string | undefined {
	const result = modules.find((module) => module.type === "Logo")?.result as
		| { lines?: unknown }
		| undefined;
	return typeof result?.lines === "string" ? cleanLogoArt(result.lines) : undefined;
}
