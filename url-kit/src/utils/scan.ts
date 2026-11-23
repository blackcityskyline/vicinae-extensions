/**
 * What `zbarimg --raw` prints, turned into codes. Pure: the process call lives in
 * `~/api/scan.ts`, so the self-checks can read a recorded output.
 */

/** One code per line, blank lines dropped, one copy of each. */
export function codesOf(output: string): string[] {
	const lines = output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return [...new Set(lines)];
}

/**
 * The image a command starts with: the argument, else the clipboard's file, else
 * the clipboard's text when it names a file that exists. `exists` is injected so
 * the decision can be checked without touching the disk.
 */
export function imageSource(
	argument: string | undefined,
	clipboard: { file?: string; text?: string },
	exists: (path: string) => boolean,
): string | undefined {
	const fromArgument = (argument ?? "").trim();
	if (fromArgument) return fromArgument;

	const file = clipboard.file?.trim();
	if (file) return file;

	const text = clipboard.text?.trim();
	if (text && !text.includes("\n") && exists(text)) return text;

	return undefined;
}
