/**
 * Urban Dictionary's public define endpoint: user-written slang, one record per
 * definition. No key, no documentation and no status page, so only the fields
 * the pane reads are typed, and a term it does not know answers `200` with an
 * empty list rather than a `404`.
 */
export type RawSlang = {
	word?: string;
	definition?: string;
	example?: string;
	author?: string;
	permalink?: string;
	written_on?: string;
	thumbs_up?: number;
	thumbs_down?: number;
};

export function slangUrl(term: string): string {
	return `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`;
}

export async function fetchSlang(term: string): Promise<RawSlang[]> {
	const response = await fetch(slangUrl(term));
	if (!response.ok) throw new Error(`Urban Dictionary answered ${response.status} ${response.statusText}`);
	const body = (await response.json()) as { list?: unknown };
	return Array.isArray(body.list) ? (body.list as RawSlang[]) : [];
}
