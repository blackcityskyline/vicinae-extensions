/** Parses `/etc/os-release`; values may be quoted, unquoted or escaped with a backslash. */
export function parseOsRelease(contents: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const rawLine of contents.split("\n")) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const separator = line.indexOf("=");
		if (separator <= 0) continue;
		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1).replace(/\\(["\\$`])/g, "$1");
		} else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}
