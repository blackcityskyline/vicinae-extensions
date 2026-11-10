/** The order the palette reads in; only the accents a theme actually defines appear. */
const ACCENT_ORDER = ["blue", "cyan", "green", "yellow", "orange", "red", "magenta", "purple"];

const SECTION = /^\[\s*([^\]]+?)\s*\]$/;
const ENTRY = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/;

type ColourValue = { name: string; lighter?: number; darker?: number };

const value = (raw: string): ColourValue | undefined => {
	const text = raw.trim();
	if (text.startsWith('"')) {
		const end = text.indexOf('"', 1);
		return end > 1 ? { name: text.slice(1, end) } : undefined;
	}
	if (!text.startsWith("{")) return undefined;
	const name = /name\s*=\s*"([^"]+)"/.exec(text)?.[1];
	if (!name) return undefined;
	const lighter = /\blighter\s*=\s*(\d+)/.exec(text)?.[1];
	const darker = /\bdarker\s*=\s*(\d+)/.exec(text)?.[1];
	return { name, lighter: lighter ? Number(lighter) : undefined, darker: darker ? Number(darker) : undefined };
};

const channels = (hex: string): [number, number, number] | undefined => {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return undefined;
	const number = Number.parseInt(match[1] ?? "", 16);
	return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff];
};

const plain = (hex: string): string | undefined =>
	channels(hex) ? `#${hex.replace("#", "").toLowerCase()}` : undefined;

/** QColor::lighter/darker: the value channel is scaled, the hue and saturation stay. */
function shade({ name, lighter, darker }: ColourValue): string | undefined {
	const rgb = channels(name);
	if (!rgb) return undefined;
	if (lighter === undefined && darker === undefined) return plain(name);

	const [r, g, b] = rgb as [number, number, number];
	const max = Math.max(r, g, b) / 255;
	const value = lighter !== undefined ? max * (1 + lighter / 100) : max / (1 + (darker ?? 0) / 100);
	const factor = max === 0 ? 1 : Math.min(1, value) / max;
	const to = (channel: number) => Math.min(255, Math.max(0, Math.round(channel * factor)));
	return `#${[to(r), to(g), to(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** `[colors.accents]` of a Vicinae theme file, as swatches in a stable order. */
export function parseAccents(toml: string): { name: string; hex: string }[] {
	let section = "";
	const accents = new Map<string, ColourValue>();

	for (const line of toml.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const header = SECTION.exec(trimmed);
		if (header) {
			section = header[1] ?? "";
			continue;
		}
		if (section !== "colors.accents") continue;
		const entry = ENTRY.exec(trimmed);
		if (!entry) continue;
		const parsed = value(entry[2] ?? "");
		if (parsed) accents.set((entry[1] ?? "").toLowerCase(), parsed);
	}

	const seen = new Set<string>();
	return ACCENT_ORDER.flatMap((key) => {
		const entry = accents.get(key);
		const hex = entry ? shade(entry) : undefined;
		if (!hex || seen.has(hex)) return [];
		seen.add(hex);
		return [{ name: key, hex }];
	});
}
