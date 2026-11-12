import {
  CATALOG_ORIGIN,
  parseArtist,
  parseArtists,
  parseRelease,
  parseReleases,
  parseSearch,
  type Artist,
  type ArtistSummary,
  type Release,
  type ReleaseSummary,
  type SearchResults,
  type Track,
} from "~/utils/monochrome";

const TIMEOUT_MS = 10_000;

async function catalog(path: string): Promise<unknown> {
  const response = await fetch(`${CATALOG_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`The Monochrome catalog answered ${response.status} for ${path.split("?")[0]}`);
  }
  return response.json().catch(() => {
    throw new Error("The Monochrome catalog answered with something that is not JSON");
  });
}

function query(path: string, text: string, limit: number): string {
  return `${path}?q=${encodeURIComponent(text.trim())}&limit=${limit}`;
}

/**
 * One request carries every category the search bar shows. The catalog has no pagination: it
 * answers what it has, and `limit` is only the ceiling. This endpoint caps the categories at
 * 8 tracks, 10 releases and 8 artists, which is why a single category asks its own endpoint.
 */
export async function searchCatalog(text: string): Promise<SearchResults> {
  const trimmed = text.trim();
  if (!trimmed) return { tracks: [], releases: [], artists: [] };
  return parseSearch(await catalog(`/search?q=${encodeURIComponent(trimmed)}`));
}

/** This one answers 8 rows whatever the limit; the cap is the catalog's. */
export async function searchTracks(text: string, limit = 100): Promise<Track[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return parseSearch(await catalog(query("/search/tracks", trimmed, limit))).tracks;
}

export async function searchReleases(text: string, limit = 100): Promise<ReleaseSummary[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return parseReleases(await catalog(query("/search/releases", trimmed, limit)));
}

export async function searchArtists(text: string, limit = 100): Promise<ArtistSummary[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return parseArtists(await catalog(query("/search/artists", trimmed, limit)));
}

export async function artist(id: string): Promise<Artist> {
  const found = parseArtist(await catalog(`/artists/${encodeURIComponent(id)}`));
  if (!found) throw new Error(`The Monochrome catalog does not know artist ${id}`);
  return found;
}

export async function releaseTracks(releaseId: string): Promise<Release> {
  const release = parseRelease(await catalog(`/releases/${encodeURIComponent(releaseId)}`));
  if (!release) throw new Error(`The Monochrome catalog does not know release ${releaseId}`);
  return release;
}
