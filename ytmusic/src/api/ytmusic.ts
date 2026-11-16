/**
 * The extension's YouTube Music API.
 *
 * The work itself lives in `ytmusic-cli` — its own repository, a `sonorahq/ytmusic-rs` crate plus
 * the calls and fields the launcher needs — so this file is only the typed surface the UI talks
 * to: one command in, one JSON answer out.
 */

import { Cache } from "@vicinae/api";

import { call } from "~/api/bridge";

import type { Auth } from "~/api/auth";
import type {
  MusicAlbum,
  MusicAlbumDetail,
  MusicArtist,
  MusicItem,
  MusicPlaylist,
  MusicPlaylistDetail,
  MusicPlaylistPage,
  MusicShelf,
} from "~/utils/ytmusic";

/** A library's continuations; `ytmusic-cli` walks a playlist to the same depth. */
const MAX_PAGES = 50;

/** The session the preferences describe. Every command run sets it before its first request. */
let auth: Auth | null = null;

export function setAuth(next: Auth | null): void {
  auth = next;
}

export function isSignedIn(): boolean {
  return auth !== null;
}

/**
 * Pages already fetched by this command process. Going back to an album, or opening a row whose
 * preview fetched the same page, must not pay the network again; a launcher process is
 * short-lived, so a page cannot go far out of date.
 */
const pages = new Map<string, Promise<unknown>>();
/** A playlist page is a few hundred kilobytes; this is a session's worth of them. */
const PAGES_LIMIT = 40;

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const found = pages.get(key);
  if (found) return found as Promise<T>;

  const promise = load().catch((error: unknown) => {
    pages.delete(key);
    throw error;
  });
  if (pages.size >= PAGES_LIMIT) {
    const oldest = pages.keys().next();
    if (!oldest.done) pages.delete(oldest.value);
  }
  pages.set(key, promise);
  return promise;
}

/** A write can change any of them; refetching one page beats a stale like. */
function forgetPages(): void {
  pages.clear();
}

/** A signed-in page says what it needs; a guest gets the reason instead of an empty list. */
function requireSignIn(what: string): Auth {
  if (auth === null) throw new Error(`Sign in to browse ${what}: open the extension preferences.`);
  return auth;
}

const ask = <T>(command: string, args: Record<string, unknown> = {}) => call<T>(command, args, auth);

// --- browse.rs -------------------------------------------------------------

export function musicAlbum(browseId: string): Promise<MusicAlbumDetail> {
  return cached(`album:${browseId}`, () => ask<MusicAlbumDetail>("album", { browseId }));
}

export function musicArtist(browseId: string): Promise<MusicArtist> {
  return cached(`artist:${browseId}`, () => ask<MusicArtist>("artist", { browseId }));
}

export function musicDiscography(channelId: string): Promise<MusicAlbum[]> {
  return cached(`discography:${channelId}`, () =>
    ask<MusicAlbum[]>("discography", { channelId }),
  );
}

export function musicPlaylistPage(playlistId: string): Promise<MusicPlaylistDetail> {
  // both spellings of the same id must hit the same entry
  const key = playlistId.replace(/^VL/, "");
  return cached(`playlist:${key}`, async () => {
    const detail = await ask<MusicPlaylistDetail>("playlist", { playlistId: key });
    rememberLength(detail.playlist);
    return detail;
  });
}

// --- a playlist's length ---------------------------------------------------

/**
 * A playlist's length is on its own page and in no list row, so a preview card could only be
 * drawn complete by waiting for that page — a second of an empty frame, then the fields. The
 * length is kept on disk instead, keyed by the playlist and its track count: a row that has it
 * draws at once, and a playlist whose count changed asks again.
 */
const lengths = new Cache({ namespace: "playlist-lengths", capacity: 512 * 1024 });

type StoredLength = { count?: number; seconds: number };

function rememberLength(playlist: MusicPlaylist | undefined): void {
  if (playlist?.duration === undefined) return;
  const stored: StoredLength = { count: playlist.trackCount, seconds: playlist.duration };
  lengths.set(playlist.id, JSON.stringify(stored));
}

/** The stored length, if it still describes this playlist. */
function knownLength(playlist: MusicPlaylist): number | undefined {
  const body = lengths.get(playlist.id);
  if (body === undefined) return undefined;

  try {
    const stored = JSON.parse(body) as StoredLength;
    return stored.count === playlist.trackCount ? stored.seconds : undefined;
  } catch {
    return undefined;
  }
}

/** The playlists themselves in one process: what a list of cards needs beyond the row data. */
async function askSummaries(playlistIds: string[]): Promise<MusicPlaylist[]> {
  if (playlistIds.length === 0) return [];
  return cached(`summaries:${[...playlistIds].sort().join(",")}`, async () => {
    const rows = await ask<MusicPlaylist[]>("playlistSummaries", { playlistIds });
    for (const row of rows) rememberLength(row);
    return rows;
  });
}

/** How many rows a page prefetches: the first screenful, not a whole library. */
const PREFETCH_LENGTHS = 24;

export function musicPlaylistContinuation(token: string): Promise<MusicPlaylistPage> {
  return ask<MusicPlaylistPage>("playlistContinuation", { continuation: token });
}

// --- search.rs -------------------------------------------------------------

export type SearchFilter = "all" | "songs" | "albums" | "artists" | "playlists" | "videos";

/**
 * One `search` call; without a filter the shelves carry every kind the query matched. The
 * filter params are the binary's own: they narrow the answer to one shelf.
 */
export function searchMusic(query: string, filter: SearchFilter = "all"): Promise<MusicShelf[]> {
  return ask<MusicShelf[]>("search", { query, filter });
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

type LibraryPage = { items: MusicItem[]; continuation?: string };

/**
 * A signed-in library page. Later pages arrive as a continuation; they are walked until the
 * list runs out or `MAX_PAGES` is reached, and each one reaches the caller as it lands.
 */
export function musicLibraryItems(
  browseId: string,
  onPage?: (items: MusicItem[]) => void,
): Promise<MusicItem[]> {
  if (onPage === undefined) {
    return cached(`library:${browseId}`, () => loadLibraryItems(browseId)).then((items) =>
      items.map(withStoredLength),
    );
  }
  return loadLibraryItems(browseId, onPage).then((items) => {
    pages.set(`library:${browseId}`, Promise.resolve(items));
    return items;
  });
}

async function loadLibraryItems(
  browseId: string,
  onPage?: (items: MusicItem[]) => void,
): Promise<MusicItem[]> {
  requireSignIn("your library");

  const items: MusicItem[] = [];
  const seen = new Set<string>();
  let continuation: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await ask<LibraryPage>(
      "library",
      continuation === undefined ? { browseId } : { continuation },
    );

    for (const item of answer.items) {
      const id = itemId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(withStoredLength(item));
    }
    onPage?.([...items]);

    continuation = answer.continuation;
    if (continuation === undefined) break;
  }

  // the saved playlists are the one list whose rows need lengths the answer does not carry
  if (browseId === LIBRARY_PLAYLISTS) prefetchPlaylistLengths(items);

  return items;
}

/** The saved playlists, without the `LM` entry the Liked songs row already covers. */
export async function musicLibraryPlaylists(): Promise<MusicPlaylist[]> {
  const items = await musicLibraryItems(LIBRARY_PLAYLISTS);
  return items.flatMap((item) =>
    "playlist" in item && item.playlist.id !== LIKED_SONGS ? [item.playlist] : [],
  );
}

/**
 * The lengths of the rows a page is about to show, in one process and behind its list. Nothing
 * waits for them: a row whose length is known draws complete, and one that is not asks for its
 * own page — this is what makes the next visit complete from the first frame.
 */
export function prefetchPlaylistLengths(items: MusicItem[]): void {
  const unknown = items.flatMap((item) =>
    "playlist" in item && item.playlist.duration === undefined ? [item.playlist.id] : [],
  );
  void askSummaries(unknown.slice(0, PREFETCH_LENGTHS)).catch(() => undefined);
}

/** A playlist row drawn with the length the cache already knows, so its card is complete. */
function withStoredLength(item: MusicItem): MusicItem {
  if (!("playlist" in item) || item.playlist.duration !== undefined) return item;
  const seconds = knownLength(item.playlist);
  return seconds === undefined ? item : { ...item, playlist: { ...item.playlist, duration: seconds } };
}

/** The signed-in play history, one shelf per day, as `FEmusic_history` answers it. */
export function musicHistory(): Promise<MusicShelf[]> {
  requireSignIn("your play history");
  return musicBrowse(HISTORY);
}

// --- mutate.rs -------------------------------------------------------------

/** Like or unlike a song; the rating lives on the account, not in this process. */
export async function likeTrack(videoId: string, liked: boolean): Promise<void> {
  requireSignIn("liking a song");
  await ask("like", { videoId, liked });
  forgetPages();
}

/** Save a playlist to the library, or take it out. */
export async function likePlaylist(playlistId: string, saved: boolean): Promise<void> {
  requireSignIn("saving a playlist");
  await ask("likePlaylist", { playlistId: playlistId.replace(/^VL/, ""), saved });
  forgetPages();
}

export async function addTrackToPlaylist(playlistId: string, videoId: string): Promise<void> {
  requireSignIn("adding to a playlist");
  await ask("addTrack", { playlistId: playlistId.replace(/^VL/, ""), videoId });
  forgetPages();
}

// --- the pages that are shelves, not models --------------------------------

export function musicBrowse(browseId: string, params?: string): Promise<MusicShelf[]> {
  return cached(`browse:${browseId}:${params ?? ""}`, () =>
    ask<MusicShelf[]>("shelves", params === undefined ? { browseId } : { browseId, params }),
  );
}

export const MUSIC_HOME = "FEmusic_home";
export const MUSIC_GENRES = "FEmusic_moods_and_genres";
export const MUSIC_CHARTS = "FEmusic_charts";
