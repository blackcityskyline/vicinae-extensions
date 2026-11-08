/** A local key that failed to parse must not cost the user their pins. */
export function parseFavorites(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [];
	} catch {
		return [];
	}
}

export function toggleFavorite(favorites: string[], name: string): string[] {
	return favorites.includes(name) ? favorites.filter((entry) => entry !== name) : [...favorites, name];
}
