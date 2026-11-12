/**
 * A port of `sonorahq/ytmusic-rs`'s `client.rs`, `context.rs`, `browse.rs`, `library.rs`,
 * `search.rs` and `mutate.rs` (GPL-3.0-or-later): the WEB_REMIX client, the album, artist,
 * discography, playlist and search pages, and the signed-in library and playlist edits.
 * PO tokens and playback are not ported; mpv and yt-dlp play and download.
 */

import { authorization, type Auth } from "~/api/auth";

import {
  albumKind,
  artistRuns,
  countFromText,
  findRenderer,
  findRenderers,
  itemsAt,
  listItemTrack,
  parseShelves,
  parseYear,
  runText,
  runsAt,
  shelfContinuation,
  strAt,
  thumbnails,
  twoRowAlbum,
  type MusicAlbum,
  type MusicAlbumDetail,
  type MusicAlbumRef,
  type MusicArtist,
  type MusicArtistRef,
  type MusicItem,
  type MusicPlaylist,
  type MusicPlaylistDetail,
  type MusicPlaylistPage,
  type MusicShelf,
  type MusicTrack,
} from "~/utils/ytmusic";

const API_BASE = "https://music.youtube.com/youtubei/v1/";
const VISITOR_URL = "https://www.youtube.com/sw.js_data";
const ORIGIN = "https://music.youtube.com";

const CLIENT_NAME = "WEB_REMIX";
const CLIENT_VERSION = "1.20260707.12.00";
const CLIENT_ID = "67";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
/** The visitor endpoint answers a page that only the visionOS client gets. */
const VISITOR_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/** A playlist's continuations; ytmusic-rs stops at the same number. */
const MAX_PAGES = 50;

const TIMEOUT = 20_000;

let visitor: string | null = null;

/** The session the preferences describe. Every command run sets it before its first request. */
let auth: Auth | null = null;

export function setAuth(next: Auth | null): void {
  auth = next;
}

export function isSignedIn(): boolean {
  return auth !== null;
}

/** A signed-in page says what it needs; a guest gets the reason instead of an empty list. */
function requireSignIn(what: string): Auth {
  if (auth === null) throw new Error(`Sign in to browse ${what}: open the extension preferences.`);
  return auth;
}

/** ytmusic-rs asks `sw.js_data` once and keeps the id; an empty answer is retried. */
async function visitorId(): Promise<string> {
  if (visitor !== null) return visitor;

  try {
    const response = await fetch(VISITOR_URL, {
      headers: { "User-Agent": VISITOR_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = await response.text();
    const issued = body.match(/"(Cg[A-Za-z0-9%_+=-]{20,})"/)?.[1];
    if (issued) {
      visitor = issued;
      return issued;
    }
  } catch {
    // an anonymous request without a visitor id still works
  }

  return "";
}

function contextOf(visitorData: string): Record<string, unknown> {
  const client: Record<string, unknown> = {
    hl: "en",
    gl: "US",
    clientName: CLIENT_NAME,
    clientVersion: CLIENT_VERSION,
    userAgent: USER_AGENT,
    utcOffsetMinutes: 0,
    osName: "Windows",
    osVersion: "10.0",
    platform: "DESKTOP",
    clientFormFactor: "UNKNOWN_FORM_FACTOR",
    browserName: "Chrome",
    browserVersion: "125.0.0.0",
    originalUrl: ORIGIN,
  };
  if (visitorData !== "") client.visitorData = visitorData;

  return {
    client,
    user: { enableSafetyMode: false, lockedSafetyMode: false },
    request: { useSsl: true, internalExperimentFlags: [] },
  };
}

/** Google answers an expired or wrong cookie as a guest, with `logged_in: 0`. */
function loggedOut(response: unknown): boolean {
  for (const list of findRenderers(response, "serviceTrackingParams")) {
    for (const tracking of itemsAt(list, [])) {
      if (strAt(tracking, ["service"]) !== "GFEEDBACK") continue;
      for (const param of itemsAt(tracking, ["params"])) {
        if (strAt(param, ["key"]) === "logged_in" && strAt(param, ["value"]) === "0") return true;
      }
    }
  }

  return false;
}

async function execute(endpoint: string, payload: Record<string, unknown>): Promise<unknown> {
  // a signed-in request carries no visitor id: the cookies are the identity
  const session = auth;
  const visitorData = session === null ? await visitorId() : "";
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Accept-Language": "*",
    "Content-Type": "application/json",
    Origin: ORIGIN,
    "User-Agent": USER_AGENT,
    "X-Youtube-Client-Name": CLIENT_ID,
    "X-Youtube-Client-Version": CLIENT_VERSION,
  };
  if (session) {
    headers.Authorization = authorization(session);
    headers["X-Origin"] = ORIGIN;
    headers["X-Goog-AuthUser"] = String(session.authUser);
    headers.Cookie = session.cookies;
  } else if (visitorData !== "") {
    headers["X-Goog-Visitor-Id"] = visitorData;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}?prettyPrint=false&alt=json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, context: contextOf(visitorData), isAudioOnly: true }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (error) {
    throw new Error(`cannot reach YouTube Music: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} returned a non-json response with status ${response.status}`);
  }

  const message = strAt(value, ["error", "message"]);
  if (message !== undefined) throw new Error(`${endpoint} failed (${response.status}): ${message}`);
  if (!response.ok) throw new Error(`${endpoint} failed with status ${response.status}`);
  if (session && loggedOut(value)) {
    throw new Error("YouTube Music did not accept the cookies: sign in again.");
  }

  return value;
}

// --- browse.rs -------------------------------------------------------------

export async function musicAlbum(browseId: string): Promise<MusicAlbumDetail> {
  const response = await execute("browse", { browseId });
  const header =
    findRenderer(response, "musicResponsiveHeaderRenderer") ??
    findRenderer(response, "musicDetailHeaderRenderer");
  if (!header) throw new Error("the album response has no header");

  const title = runText(header, ["title"]) ?? "";
  const subtitleRuns = runsAt(header, ["subtitle"]);
  const secondRuns = runsAt(header, ["secondSubtitle"]);
  const texts = subtitleRuns.map((run) => strAt(run, ["text"]) ?? "");

  let artists = artistRuns(runsAt(header, ["straplineTextOne"]));
  artists = [...artists, ...artistRuns(subtitleRuns)];
  if (artists.length === 0) {
    const strapline = runText(header, ["straplineTextOne"]);
    if (strapline !== undefined) artists.push({ name: strapline });
  }

  const found = thumbnails(header);
  const album: MusicAlbum = {
    browseId,
    playlistId: playlistIdOf(header),
    title,
    artists,
    kind: texts.map(albumKind).find((kind) => kind !== undefined) ?? "Album",
    year: [...subtitleRuns, ...secondRuns]
      .map((run) => strAt(run, ["text"]) ?? "")
      .map(parseYear)
      .find((year) => year !== undefined),
    trackCount:
      secondRuns
        .map((run) => strAt(run, ["text"]) ?? "")
        .map(countFromText)
        .find((count) => count !== undefined) ?? undefined,
    thumbnails: found,
  };

  const description =
    runText(findRenderer(header, "musicDescriptionShelfRenderer"), ["description"]) ??
    runText(header, ["description"]);

  const tracks: MusicTrack[] = [];
  for (const shelf of [
    ...findRenderers(response, "musicShelfRenderer"),
    ...findRenderers(response, "musicPlaylistShelfRenderer"),
  ]) {
    for (const item of itemsAt(shelf, ["contents"])) {
      const track = listItemTrack(item);
      if (track) tracks.push(track);
    }
  }

  const albumRef: MusicAlbumRef = { name: title, id: browseId };
  for (const track of tracks) {
    track.album ??= albumRef;
    if (track.thumbnails.length === 0) track.thumbnails = found;
    if (track.artists.length === 0) track.artists = artists;
  }

  album.trackCount ??= tracks.length;
  return { album, description, tracks };
}

export async function musicArtist(browseId: string): Promise<MusicArtist> {
  const response = await execute("browse", { browseId });
  const header =
    findRenderer(response, "musicImmersiveHeaderRenderer") ??
    findRenderer(response, "musicVisualHeaderRenderer") ??
    findRenderer(response, "musicHeaderRenderer");
  if (!header) throw new Error("the artist response has no header");

  const name = runText(header, ["title"]) ?? "";
  const description = (
    runText(header, ["description"]) ??
    runText(findRenderer(response, "musicDescriptionShelfRenderer"), ["description"]) ??
    ""
  ).trim();
  const subscribers =
    runText(header, ["subscriptionButton", "subscribeButtonRenderer", "subscriberCountText"]) ??
    runText(findRenderer(header, "subscribeButtonRenderer"), ["subscriberCountText"]);

  const topTracks: MusicTrack[] = [];
  const topShelf = findRenderer(response, "musicShelfRenderer");
  if (topShelf) {
    for (const item of itemsAt(topShelf, ["contents"])) {
      const track = listItemTrack(item);
      if (track) topTracks.push(track);
    }
  }

  const albums: MusicAlbum[] = [];
  const singles: MusicAlbum[] = [];
  for (const carousel of findRenderers(response, "musicCarouselShelfRenderer")) {
    const label =
      runText(carousel, ["header", "musicCarouselShelfBasicHeaderRenderer", "title"]) ?? "";
    const bucket =
      label === "Albums"
        ? albums
        : label === "Singles" || label === "Singles & EPs" || label === "Singles and EPs"
          ? singles
          : undefined;
    if (!bucket) continue;

    for (const item of itemsAt(carousel, ["contents"])) {
      const album = twoRowAlbum(item);
      if (album) bucket.push(album);
    }
  }

  const own: MusicArtistRef = { name, id: browseId };
  credit(albums, own);
  credit(singles, own);

  return {
    browseId,
    name,
    description: description === "" ? undefined : description,
    subscribers,
    thumbnails: thumbnails(header),
    topTracks,
    albums,
    singles,
  };
}

/**
 * Every release on an artist's discography page, newest first. The artist page
 * carousels stop at ten albums and ten singles, so this is the only way to the
 * full list. Pages past the first are fetched until the grid runs out.
 */
export async function musicDiscography(channelId: string): Promise<MusicAlbum[]> {
  let response = await execute("browse", { browseId: `MPAD${channelId}` });
  const own: MusicArtistRef = {
    name: runText(findRenderer(response, "musicHeaderRenderer"), ["title"]) ?? "",
    id: channelId,
  };

  const albums: MusicAlbum[] = [];
  let pages = 0;
  for (;;) {
    let token: string | undefined;
    for (const grid of [
      ...findRenderers(response, "gridRenderer"),
      ...findRenderers(response, "gridContinuation"),
    ]) {
      for (const item of itemsAt(grid, ["items"])) {
        const album = twoRowAlbum(item);
        if (album) albums.push(album);
      }
      token = token ?? shelfContinuation(grid);
    }

    pages += 1;
    if (!token || pages >= MAX_PAGES) break;
    response = await execute("browse", { continuation: token });
  }

  credit(albums, own);
  return albums;
}

export async function musicPlaylistPage(playlistId: string): Promise<MusicPlaylistDetail> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  const response = await execute("browse", { browseId });
  const header =
    findRenderer(response, "musicResponsiveHeaderRenderer") ??
    findRenderer(response, "musicDetailHeaderRenderer");
  if (!header) throw new Error("the playlist response has no header");

  const title = runText(header, ["title"]) ?? "";
  const author = [...runsAt(header, ["straplineTextOne"]), ...runsAt(header, ["subtitle"])]
    .map((run) => strAt(run, ["text"]) ?? "")
    .find(
      (text) =>
        text !== "" &&
        text !== " • " &&
        text !== ", " &&
        !text.startsWith("Playlist") &&
        !text.startsWith("Album") &&
        parseYear(text) === undefined,
    );

  const tracks: MusicTrack[] = [];
  collectListTracks(response, tracks);

  return {
    playlist: {
      id: browseId.replace(/^VL/, ""),
      title,
      author,
      trackCount:
        runsAt(header, ["secondSubtitle"])
          .map((run) => strAt(run, ["text"]) ?? "")
          .map(countFromText)
          .find((count) => count !== undefined) ?? tracks.length,
      thumbnails: thumbnails(header),
    },
    tracks,
    continuation: nextContinuation(response),
  };
}

export async function musicPlaylistContinuation(token: string): Promise<MusicPlaylistPage> {
  const response = await execute("browse", { continuation: token });
  const tracks: MusicTrack[] = [];
  collectListTracks(response, tracks);
  return { tracks, continuation: nextContinuation(response) };
}

function collectListTracks(response: unknown, tracks: MusicTrack[]): void {
  let items: unknown[] = [];
  for (const shelf of findRenderers(response, "musicPlaylistShelfRenderer")) {
    items.push(...itemsAt(shelf, ["contents"]));
  }
  if (items.length === 0) {
    for (const shelf of findRenderers(response, "musicShelfRenderer")) {
      items.push(...itemsAt(shelf, ["contents"]));
    }
  }
  if (items.length === 0) {
    for (const action of findRenderers(response, "appendContinuationItemsAction")) {
      items.push(...itemsAt(action, ["continuationItems"]));
    }
    for (const continuation of [
      ...findRenderers(response, "musicPlaylistShelfContinuation"),
      ...findRenderers(response, "musicShelfContinuation"),
    ]) {
      items.push(...itemsAt(continuation, ["contents"]));
    }
  }

  for (const item of items) {
    const track = listItemTrack(item);
    if (track) tracks.push(track);
  }
}

function nextContinuation(response: unknown): string | undefined {
  for (const shelf of [
    ...findRenderers(response, "musicPlaylistShelfRenderer"),
    ...findRenderers(response, "musicShelfRenderer"),
    ...findRenderers(response, "gridRenderer"),
    ...findRenderers(response, "musicPlaylistShelfContinuation"),
    ...findRenderers(response, "musicShelfContinuation"),
    ...findRenderers(response, "gridContinuation"),
  ]) {
    const token = shelfContinuation(shelf);
    if (token) return token;
  }

  for (const item of findRenderers(response, "continuationItemRenderer")) {
    const token = strAt(item, ["continuationEndpoint", "continuationCommand", "token"]);
    if (token) return token;
  }

  return undefined;
}

function playlistIdOf(response: unknown): string | undefined {
  for (const key of ["watchPlaylistEndpoint", "watchEndpoint"]) {
    for (const endpoint of findRenderers(response, key)) {
      const playlistId = strAt(endpoint, ["playlistId"]);
      if (playlistId) return playlistId;
    }
  }

  return undefined;
}

/** Names `artist` on every release that lists no one. */
function credit(albums: MusicAlbum[], artist: MusicArtistRef): void {
  if (artist.name === "") return;
  for (const album of albums) {
    if (album.artists.length === 0) album.artists.push(artist);
  }
}

// --- search.rs -------------------------------------------------------------

export type SearchFilter = "all" | "songs" | "albums" | "artists" | "playlists" | "videos";

/**
 * The `params` each filter sends, measured against the live endpoint: they narrow the
 * answer to one shelf, so the UI can show one kind at a time.
 */
const FILTER_PARAMS: Record<Exclude<SearchFilter, "all">, string> = {
  songs: "EgWKAQIIAWoMEA4QChADEAQQCRAF",
  videos: "EgWKAQIQAWoMEA4QChADEAQQCRAF",
  albums: "EgWKAQIYAWoMEA4QChADEAQQCRAF",
  artists: "EgWKAQIgAWoMEA4QChADEAQQCRAF",
  playlists: "EgWKAQIoAWoMEA4QChADEAQQCRAF",
};

/** One `search` call; without a filter the shelves carry every kind the query matched. */
export async function searchMusic(
  query: string,
  filter: SearchFilter = "all",
): Promise<MusicShelf[]> {
  const params = filter === "all" ? undefined : FILTER_PARAMS[filter];
  const response = await execute("search", params ? { query, params } : { query });
  return parseShelves(response);
}

// --- library.rs ------------------------------------------------------------

/** The `LM` playlist every account has: the songs the user liked. */
export const LIKED_SONGS = "LM";

export const LIBRARY_ALBUMS = "FEmusic_liked_albums";
export const LIBRARY_PLAYLISTS = "FEmusic_liked_playlists";
export const LIBRARY_ARTISTS = "FEmusic_library_corpus_track_artists";
export const LIBRARY_SUBSCRIPTIONS = "FEmusic_library_corpus_artists";
const HISTORY = "FEmusic_history";

/** Stable across pages, so a continuation cannot repeat a row. */
function itemId(item: MusicItem): string {
  if ("track" in item) return `track:${item.track.videoId ?? item.track.title}`;
  if ("album" in item) return `album:${item.album.browseId}`;
  if ("playlist" in item) return `playlist:${item.playlist.id}`;
  return `page:${item.page.browseId}:${item.page.title}`;
}

/**
 * A signed-in library page. Later pages arrive as `gridContinuation` or
 * `musicShelfContinuation`; they are walked until the list runs out or `MAX_PAGES` is reached.
 */
export async function musicLibraryItems(browseId: string): Promise<MusicItem[]> {
  requireSignIn("your library");
  let response = await execute("browse", { browseId });

  const items: MusicItem[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    for (const shelf of parseShelves(response)) {
      for (const item of shelf.items) {
        const id = itemId(item);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push(item);
      }
    }

    const token = nextContinuation(response);
    if (!token) break;
    response = await execute("browse", { continuation: token });
  }

  return items;
}

/** The saved playlists, without the `LM` entry the Liked songs row already covers. */
export async function musicLibraryPlaylists(): Promise<MusicPlaylist[]> {
  const items = await musicLibraryItems(LIBRARY_PLAYLISTS);
  return items.flatMap((item) =>
    "playlist" in item && item.playlist.id !== LIKED_SONGS ? [item.playlist] : [],
  );
}

/** The signed-in play history, one shelf per day, as `FEmusic_history` answers it. */
export async function musicHistory(): Promise<MusicShelf[]> {
  requireSignIn("your play history");
  const response = await execute("browse", { browseId: HISTORY });
  return parseShelves(response);
}

// --- mutate.rs -------------------------------------------------------------

function barePlaylistId(playlistId: string): string {
  return playlistId.replace(/^VL/, "");
}

/** Like or unlike a song; the rating lives on the account, not in this process. */
export async function likeTrack(videoId: string, liked: boolean): Promise<void> {
  requireSignIn("liking a song");
  await execute(liked ? "like/like" : "like/removelike", { target: { videoId } });
}

/** Save or unsave a playlist or an album's `OLAK5uy_…` playlist. */
export async function likePlaylist(playlistId: string, saved: boolean): Promise<void> {
  requireSignIn("saving a playlist");
  await execute(saved ? "like/like" : "like/removelike", {
    target: { playlistId: barePlaylistId(playlistId) },
  });
}

export async function addTrackToPlaylist(playlistId: string, videoId: string): Promise<void> {
  requireSignIn("changing a playlist");
  await execute("browse/edit_playlist", {
    playlistId: barePlaylistId(playlistId),
    actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId, dedupeOption: "DEDUPE_OPTION_SKIP" }],
  });
}

// --- the pages ytmusic-rs does not model ------------------------------------

export async function musicBrowse(browseId: string, params?: string): Promise<MusicShelf[]> {
  const response = await execute("browse", params ? { browseId, params } : { browseId });
  return parseShelves(response);
}

export const MUSIC_HOME = "FEmusic_home";
export const MUSIC_GENRES = "FEmusic_moods_and_genres";
export const MUSIC_CHARTS = "FEmusic_charts";
