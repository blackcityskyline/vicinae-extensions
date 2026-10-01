import { errorFor, imageUrl, playedAt, requestUrl, unwrapList, type Album, type Artist, type LastFmImage, type Track } from "~/utils/lastfm";

/** A hung request must not hang the panel. */
const TIMEOUT_MS = 15_000;

const DEFAULT_LIMIT = 50;

export class LastFmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastFmError";
  }
}

type ApiError = { error?: number; message?: string };

async function call<T>(apiKey: string, method: string, params: Record<string, string | number>): Promise<T> {
  const url = requestUrl(method, { api_key: apiKey, format: "json", ...params });

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    throw new LastFmError(`Could not reach Last.fm. ${reason}`.trim());
  }

  // Last.fm answers 200 with an `error` member for a bad key or an unknown
  // username, so the status alone says nothing.
  const body = (await response.json().catch(() => ({}))) as ApiError;
  if (body.error !== undefined) throw new LastFmError(errorFor(body.error));

  return body as T;
}

/**
 * `artist` and `album` are objects whose name lives in a different member
 * depending on the method: `user.getrecenttracks` sends `#text`, while
 * `user.getlovedtracks` and `user.gettopalbums` send `name`. Measured against
 * the live API — reading only one of them leaves every recent track showing
 * "Unknown artist".
 */
type Named = { name?: string; "#text"?: string; url?: string; mbid?: string };

function named(value: Named | undefined, fallback = "Unknown artist"): string {
  return value?.name || value?.["#text"] || fallback;
}

type RawTrack = {
  name: string;
  url: string;
  mbid?: string;
  image?: LastFmImage[];
  date?: { "#text"?: string; uts?: string } | string;
  artist?: Named;
  album?: Named;
  "@attr"?: { nowplaying?: string };
};

export async function recentTracks(apiKey: string, username: string): Promise<Track[]> {
  const body = await call<{ recenttracks?: { track?: RawTrack[] | RawTrack } }>(apiKey, "user.getrecenttracks", {
    user: username,
    limit: DEFAULT_LIMIT,
  });

  return unwrapList(body.recenttracks?.track).map((entry) => ({
    name: entry.name,
    artist: named(entry.artist),
    album: named(entry.album, ""),
    url: entry.url,
    image: imageUrl(entry.image),
    played: entry["@attr"]?.nowplaying === "true" ? "now" : playedAt(entry),
    mbid: entry.mbid,
  }));
}

export async function lovedTracks(apiKey: string, username: string): Promise<Track[]> {
  const body = await call<{ lovedtracks?: { track?: RawTrack[] | RawTrack } }>(apiKey, "user.getlovedtracks", {
    user: username,
    limit: DEFAULT_LIMIT,
  });

  return unwrapList(body.lovedtracks?.track).map((entry) => ({
    name: entry.name,
    artist: named(entry.artist),
    album: named(entry.album, ""),
    url: entry.url,
    image: imageUrl(entry.image),
    loved: playedAt(entry),
    mbid: entry.mbid,
  }));
}

/**
 * `listeners` and `tags` exist on the chart methods but not on
 * `user.gettopartists`, which is the one this extension calls. The rank does,
 * and it is the authority — the position in the list would only agree with it.
 */
type RawArtist = {
  name: string;
  url: string;
  playcount?: string;
  image?: LastFmImage[];
  "@attr"?: { rank?: string };
};

export async function topArtists(apiKey: string, username: string, period: string): Promise<Artist[]> {
  const body = await call<{ artists?: { artist?: RawArtist[] | RawArtist } }>(apiKey, "user.gettopartists", {
    user: username,
    period,
    limit: DEFAULT_LIMIT,
  });

  return unwrapList(body.artists?.artist).map((entry, index) => ({
    name: entry.name,
    url: entry.url,
    image: imageUrl(entry.image),
    playcount: entry.playcount ?? "0",
    rank: Number(entry["@attr"]?.rank) || index + 1,
  }));
}

type RawAlbum = {
  name: string;
  url: string;
  playcount?: string;
  image?: LastFmImage[];
  artist?: Named;
  "@attr"?: { rank?: string };
};

export async function topAlbums(apiKey: string, username: string, period: string): Promise<Album[]> {
  const body = await call<{ topalbums?: { album?: RawAlbum[] | RawAlbum } }>(apiKey, "user.gettopalbums", {
    user: username,
    period,
    limit: DEFAULT_LIMIT,
  });

  return unwrapList(body.topalbums?.album).map((entry, index) => ({
    name: entry.name,
    artist: named(entry.artist),
    url: entry.url,
    image: imageUrl(entry.image),
    playcount: entry.playcount,
    rank: Number(entry["@attr"]?.rank) || index + 1,
  }));
}
