/** Minutes from a preference, clamped; anything unreadable falls back. */
export function minutes(value: string | undefined, fallback: number, low = 1, high = 600): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(low, Math.min(high, parsed));
}

/** mpv volume, clamped to 0-100. */
export function volume(value: string | undefined, fallback = 60): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(100, parsed));
}

/** Only http(s) links are playable; everything else would be an mpv option. */
export function validStream(url: string): boolean {
	return /^https?:\/\/\S+$/i.test(url.trim());
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
