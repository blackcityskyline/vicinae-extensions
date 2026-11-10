/**
 * Vicinae writes `//` comments into `settings.json`, and JSON.parse refuses
 * them. Strings are skipped so a `//` inside a value survives.
 */
export function stripJsonComments(text: string): string {
	let out = "";
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];

		if (inString) {
			out += char;
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') {
			inString = true;
			out += char;
			continue;
		}

		if (char === "/" && text[index + 1] === "/") {
			while (index < text.length && text[index] !== "\n") index += 1;
			out += "\n";
			continue;
		}

		out += char;
	}

	return out;
}
