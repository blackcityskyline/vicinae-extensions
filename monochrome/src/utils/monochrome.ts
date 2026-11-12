/**
 * Monochrome's catalog (tracks.monochrome.st) and the web app it belongs to. The parsing
 * here is the part worth a check: the catalog is a third-party service, so a field that
 * moves must produce a missing row, not a broken view.
 */

export const CATALOG_ORIGIN = "https://tracks.monochrome.st";
const WEB_ORIGIN = "https://monochrome.st";

type Raw = Record<string, unknown>;

export type Track = {
  id: string;
  title: string;
  artists: string[];
  /** The primary artist, when the reply names one. */
  artistId?: string;
  releaseId?: string;
  artwork?: string;
  /** Whole seconds: the catalog answers in milliseconds. */
  duration?: number;
  /** 1-based within its disc; the album page's tracks carry it. */
  trackNumber?: number;
  playable: boolean;
};

export type Release = {
  id: string;
  title: string;
  artwork?: string;
  tracks: Track[];
};

/** What a search or an artist page lists: an album without its tracks. */
export type ReleaseSummary = {
  id: string;
  title: string;
  artists: string[];
  artistId?: string;
  artwork?: string;
  releaseType?: string;
  releaseDate?: string;
  trackCount?: number;
};

export type ArtistSummary = {
  id: string;
  name: string;
  avatar?: string;
};

export type Artist = ArtistSummary & {
  bio?: string;
  externalLink?: string;
  popular: Track[];
  albums: ReleaseSummary[];
  singles: ReleaseSummary[];
  compilations: ReleaseSummary[];
};

export type SearchResults = {
  tracks: Track[];
  releases: ReleaseSummary[];
  artists: ArtistSummary[];
};

export function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** `artistNames` is the flat list search answers with; a release carries `artists`. */
function artistNames(raw: Raw): string[] {
  const named = asArray(raw.artistNames).flatMap((value) => {
    const name = asText(value);
    return name ? [name] : [];
  });
  if (named.length > 0) return named;

  const described = asArray(raw.artists).flatMap((value) => {
    const artist = asRecord(value);
    const name = artist ? (asText(artist.name) ?? asText(artist.displayName)) : undefined;
    return name ? [name] : [];
  });
  return described.length > 0 ? described : ["Unknown Artist"];
}

/** `artistIds[0]` on a track, `artists[0].artistId` on a release. */
function firstArtistId(raw: Raw): string | undefined {
  const ids = asArray(raw.artistIds).flatMap((value) => {
    const id = asText(value);
    return id ? [id] : [];
  });
  if (ids[0]) return ids[0];

  const artist = asRecord(asArray(raw.artists)[0]);
  return artist ? (asText(artist.artistId) ?? asText(artist.id)) : undefined;
}

function parseTrack(value: unknown): Track | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asText(raw.trackId) ?? asText(raw.id);
  const title = asText(raw.title);
  if (!id || !title) return null;

  const artistId = firstArtistId(raw);
  const releaseId = asText(raw.releaseId);
  const artwork = asText(raw.artwork);
  const milliseconds = typeof raw.duration === "number" ? raw.duration : undefined;
  const trackNumber = typeof raw.trackNumber === "number" ? raw.trackNumber : undefined;

  return {
    id,
    title,
    artists: artistNames(raw),
    ...(artistId ? { artistId } : {}),
    ...(releaseId ? { releaseId } : {}),
    ...(artwork ? { artwork } : {}),
    ...(milliseconds === undefined
      ? {}
      : { duration: Math.round(milliseconds > 1000 ? milliseconds / 1000 : milliseconds) }),
    ...(trackNumber === undefined ? {} : { trackNumber }),
    playable: raw.playable !== false,
  };
}

/** The rows a search can play: an entry the catalog marks unplayable has nothing to stream. */
export function parseTracks(value: unknown): Track[] {
  return asArray(value).flatMap((entry) => {
    const track = parseTrack(entry);
    return track && track.playable ? [track] : [];
  });
}

function parseReleaseSummary(value: unknown): ReleaseSummary | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asText(raw.releaseId) ?? asText(raw.id);
  const title = asText(raw.title);
  if (!id || !title) return null;

  const artistId = firstArtistId(raw);
  const artwork = asText(raw.artwork);
  const releaseType = asText(raw.releaseType);
  const releaseDate = asText(raw.releaseDate);
  const trackCount = typeof raw.trackCount === "number" ? raw.trackCount : undefined;

  return {
    id,
    title,
    artists: artistNames(raw),
    ...(artistId ? { artistId } : {}),
    ...(artwork ? { artwork } : {}),
    ...(releaseType ? { releaseType } : {}),
    ...(releaseDate ? { releaseDate } : {}),
    ...(trackCount === undefined ? {} : { trackCount }),
  };
}

function parseArtistSummary(value: unknown): ArtistSummary | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asText(raw.artistId) ?? asText(raw.id);
  const name = asText(raw.name) ?? asText(raw.displayName);
  if (!id || !name) return null;

  const avatar = asText(raw.avatar);
  return { id, name, ...(avatar ? { avatar } : {}) };
}

function summaries(value: unknown): ReleaseSummary[] {
  return asArray(value).flatMap((entry) => {
    const release = parseReleaseSummary(entry);
    return release ? [release] : [];
  });
}

function artistSummaries(value: unknown): ArtistSummary[] {
  return asArray(value).flatMap((entry) => {
    const artist = parseArtistSummary(entry);
    return artist ? [artist] : [];
  });
}

/** `/search/tracks` answers the tracks, the releases and the artists of one query. */
export function parseSearch(value: unknown): SearchResults {
  const raw = asRecord(value);
  if (!raw) return { tracks: [], releases: [], artists: [] };

  return {
    tracks: parseTracks(raw.tracks),
    releases: summaries(raw.releases),
    artists: artistSummaries(raw.artists),
  };
}

export function parseReleases(value: unknown): ReleaseSummary[] {
  const raw = asRecord(value);
  return summaries(raw?.releases);
}

export function parseArtists(value: unknown): ArtistSummary[] {
  const raw = asRecord(value);
  return artistSummaries(raw?.artists);
}

/** `/artists/<id>` answers everything an artist page shows, in one reply. */
export function parseArtist(value: unknown): Artist | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const summary = parseArtistSummary(raw);
  if (!summary) return null;

  const bio = asText(raw.bio) ?? asText(raw.biography);
  const externalLink = asText(raw.externalLink);

  return {
    ...summary,
    ...(bio ? { bio } : {}),
    ...(externalLink ? { externalLink } : {}),
    popular: parseTracks(raw.topTracks),
    albums: summaries(raw.albums),
    singles: summaries(raw.singles),
    compilations: summaries(raw.compilations),
  };
}

export function parseRelease(value: unknown): Release | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = asText(raw.releaseId) ?? asText(raw.id);
  const title = asText(raw.title);
  if (!id || !title) return null;

  const artwork = asText(raw.artwork);
  const tracks = asArray(raw.tracks).flatMap((entry) => {
    const track = parseTrack(entry);
    if (!track || !track.playable) return [];
    return [track.artwork ? track : { ...track, ...(artwork ? { artwork } : {}) }];
  });

  return { id, title, ...(artwork ? { artwork } : {}), tracks };
}

/** The URL mpv streams: a FLAC file, served with range support. */
export function streamUrl(trackId: string): string {
  return `${CATALOG_ORIGIN}/track/${encodeURIComponent(trackId)}`;
}

/** The page a browser opens for the same track. */
export function webUrl(trackId: string): string {
  return `${WEB_ORIGIN}/track/${encodeURIComponent(trackId)}`;
}

export function albumUrl(releaseId: string): string {
  return `${WEB_ORIGIN}/album/${encodeURIComponent(releaseId)}`;
}

export function artistUrl(artistId: string): string {
  return `${WEB_ORIGIN}/artist/${encodeURIComponent(artistId)}`;
}

/** mpv's playlist holds the URL, so a queue row recovers its track id from it. */
export function trackIdFromUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.origin !== CATALOG_ORIGIN) return undefined;

  const match = /^\/track\/([^/]+)$/.exec(parsed.pathname);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : undefined;
}

/**
 * The catalog answers in its own relevance order and ignores `sort`/`order` parameters, so an
 * ordering is only ever what the list does to what it already has.
 */
export type SortOrder = "relevance" | "title";

const collate = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Relevance is the reply's order, and re-sorting it would be a lie. */
export function sortTracks(tracks: Track[], order: SortOrder): Track[] {
  if (order === "relevance") return tracks;
  return [...tracks].sort((left, right) => collate.compare(left.title, right.title));
}

export function sortReleases(releases: ReleaseSummary[], order: SortOrder): ReleaseSummary[] {
  if (order === "relevance") return releases;
  return [...releases].sort((left, right) => collate.compare(left.title, right.title));
}

export function sortArtists(artists: ArtistSummary[], order: SortOrder): ArtistSummary[] {
  if (order === "relevance") return artists;
  return [...artists].sort((left, right) => collate.compare(left.name, right.name));
}

export function artistsOf(artists: string[]): string {
  return artists.join(", ");
}

/** `minutes:seconds`, the unit mpv reports. */
export function clock(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Titles from the catalog can carry markdown punctuation; the detail pane is markdown. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#]/g, "\\$&");
}
