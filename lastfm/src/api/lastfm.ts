import {
  attrNumber,
  errorFor,
  imageUrl,
  playedAt,
  requestUrl,
  unwrapList,
  type Album,
  type Artist,
  type LastFmImage,
  type Track,
} from "~/utils/lastfm";

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
  playcount?: string;
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
    rank: 0,
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
    rank: 0,
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

/* ---------------------------------------------------------------------------
 * Everything below the four personal commands. All of it read-only and verified
 * against the live API with nothing but the key.
 * ------------------------------------------------------------------------- */

/** Last.fm's paging lives in `@attr` as strings. */
type Attrs = Record<string, string> | undefined;

export type Chart = { artists: Artist[]; tracks: Track[] };

/** The global charts, which need no username at all. */
export async function globalChart(apiKey: string): Promise<Chart> {
  const [artists, tracks] = await Promise.all([
    call<{ artists?: { artist?: RawArtist[] | RawArtist } }>(apiKey, "chart.getTopArtists", { limit: 20 }),
    call<{ tracks?: { track?: RawTrack[] | RawTrack } }>(apiKey, "chart.getTopTracks", { limit: 20 }),
  ]);

  return {
    artists: unwrapList(artists.artists?.artist).map((entry, index) => artist(entry, index)),
    tracks: unwrapList(tracks.tracks?.track).map((entry, index) => track(entry, index)),
  };
}

function artist(entry: RawArtist, index: number): Artist {
  return {
    name: entry.name,
    url: entry.url,
    image: imageUrl(entry.image),
    playcount: entry.playcount ?? "",
    rank: Number(entry["@attr"]?.rank) || index + 1,
  };
}

function track(entry: RawTrack, index: number): Track {
  return {
    name: entry.name,
    artist: named(entry.artist),
    album: named(entry.album, ""),
    url: entry.url,
    image: imageUrl(entry.image),
    playcount: entry.playcount,
    rank: index + 1,
  };
}

export async function topTracks(apiKey: string, username: string, period: string): Promise<Track[]> {
  const body = await call<{ toptracks?: { track?: RawTrack[] | RawTrack } }>(apiKey, "user.getTopTracks", {
    user: username,
    period,
    limit: DEFAULT_LIMIT,
  });

  return unwrapList(body.toptracks?.track).map((entry, index) => track(entry, index));
}

/**
 * The three weeklies, not `user.getWeeklyChartList`: that one answers with a list
 * of `{ "#text": "", from, to }` — measured at 1128 entries for one account, all
 * of them empty. The dated charts are the ones with rows in them.
 */
export async function weeklyChart(apiKey: string, username: string): Promise<Chart & { from?: string; to?: string }> {
  type WeeklyArtists = { weeklyartistchart?: { artist?: RawArtist[] | RawArtist; "@attr"?: Attrs } };
  type WeeklyTracks = { weeklytrackchart?: { track?: RawTrack[] | RawTrack; "@attr"?: Attrs } };

  const [artists, tracks] = await Promise.all([
    call<WeeklyArtists>(apiKey, "user.getWeeklyArtistChart", { user: username }),
    call<WeeklyTracks>(apiKey, "user.getWeeklyTrackChart", { user: username }),
  ]);

  const window = artists.weeklyartistchart?.["@attr"] ?? tracks.weeklytrackchart?.["@attr"];

  return {
    artists: unwrapList(artists.weeklyartistchart?.artist).map((entry, index) => artist(entry, index)),
    tracks: unwrapList(tracks.weeklytrackchart?.track).map((entry, index) => track(entry, index)),
    from: window?.from,
    to: window?.to,
  };
}

export type LibraryPage = { artists: Artist[]; page: number; hasMore: boolean };

/** One page of everything scrobbled, not just the top of it. */
export async function libraryArtists(apiKey: string, username: string, page: number, perPage = 50): Promise<LibraryPage> {
  const body = await call<{ artists?: { artist?: RawArtist[] | RawArtist; "@attr"?: Attrs } }>(
    apiKey,
    "library.getArtists",
    { user: username, page, limit: perPage },
  );

  const rows = unwrapList(body.artists?.artist).map((entry) => ({
    name: entry.name,
    url: entry.url,
    image: imageUrl(entry.image),
    playcount: "",
    rank: 0,
  }));

  const totalPages = attrNumber(body.artists?.["@attr"], "totalPages");

  return { artists: rows, page, hasMore: page < totalPages };
}

export type Match = {
  name: string;
  url: string;
  image?: string;
  listeners: string;
};

/** Search lives under `results.artistmatches`, with opensearch metadata beside it. */
export async function searchArtists(apiKey: string, query: string, limit = 20): Promise<Match[]> {
  const body = await call<{ results?: { artistmatches?: { artist?: RawMatch[] | RawMatch } } }>(
    apiKey,
    "artist.search",
    { artist: query, limit },
  );

  return unwrapList(body.results?.artistmatches?.artist).map((entry) => ({
    name: entry.name,
    url: entry.url,
    image: imageUrl(entry.image),
    // Search results carry listeners and no play count. Measured.
    listeners: entry.listeners ?? "",
  }));
}

type RawMatch = {
  name: string;
  url: string;
  listeners?: string;
  image?: LastFmImage[];
};

export type ArtistPage = {
  name: string;
  url: string;
  image?: string;
  listeners: string;
  playcount: string;
  tags: string[];
  summary: string;
  tracks: Track[];
  albums: Album[];
  similar: Match[];
};

/** One artist, from the five methods that describe one, fetched together. */
export async function artistPage(apiKey: string, name: string): Promise<ArtistPage> {
  type Info = {
    artist?: {
      name: string;
      url: string;
      image?: LastFmImage[];
      stats?: { listeners?: string; playcount?: string };
      tags?: { tag?: { name: string }[] | { name: string } };
      bio?: { summary?: string };
      similar?: { artist?: RawMatch[] | RawMatch };
    };
  };

  const [info, topTracks, topAlbums] = await Promise.all([
    call<Info>(apiKey, "artist.getInfo", { artist: name }),
    call<{ toptracks?: { track?: RawTrack[] | RawTrack } }>(apiKey, "artist.getTopTracks", { artist: name, limit: 10 }),
    call<{ topalbums?: { album?: RawAlbum[] | RawAlbum } }>(apiKey, "artist.getTopAlbums", { artist: name, limit: 10 }),
  ]);

  const found = info.artist;

  return {
    name: found?.name ?? name,
    url: found?.url ?? `https://www.last.fm/music/${encodeURIComponent(name)}`,
    image: imageUrl(found?.image),
    listeners: found?.stats?.listeners ?? "",
    playcount: found?.stats?.playcount ?? "",
    tags: unwrapList(found?.tags?.tag).map((tag) => tag.name),
    summary: found?.bio?.summary ?? "",
    tracks: unwrapList(topTracks.toptracks?.track).map((entry, index) => track(entry, index)),
    albums: unwrapList(topAlbums.topalbums?.album).map((entry, index) => ({
      name: entry.name,
      artist: named(entry.artist),
      url: entry.url,
      image: imageUrl(entry.image),
      playcount: entry.playcount,
      rank: index + 1,
    })),
    similar: unwrapList(found?.similar?.artist).map((entry) => ({
      name: entry.name,
      url: entry.url,
      image: imageUrl(entry.image),
      listeners: entry.listeners ?? "",
    })),
  };
}
