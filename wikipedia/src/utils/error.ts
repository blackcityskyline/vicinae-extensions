export function errorText(value: unknown): string {
	if (value instanceof Error) return value.message;
	return String(value);
}
