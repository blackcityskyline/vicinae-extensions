export function sanitizeText(value: unknown, maxLen = 256): string {
	if (value === undefined || value === null) return "";
	const limit = typeof maxLen === "number" && maxLen > 0 ? maxLen : 256;
	return String(value)
		.replace(/[\x00-\x1f\x7f]/g, "")
		.slice(0, limit);
}