/**
 * A port of `sonorahq/ytmusic-rs`'s `nav.rs`, `util.rs`, `models.rs` and `parse.rs`
 * (GPL-3.0-or-later), with the playback half left out because mpv and yt-dlp play and
 * download. Function names and shapes follow the Rust source.
 */

type Raw = Record<string, unknown>;

export type MusicThumbnail = { url: string; width?: number; height?: number };

export type MusicArtistRef = { name: string; id?: string };

export type MusicAlbumRef = { name: string; id?: string };

export type MusicTrackKind = "song" | "video";

export type MusicTrack = {
  videoId?: string;
  title: string;
  artists: MusicArtistRef[];
  album?: MusicAlbumRef;
  /** Seconds, the unit yt-x entries already use. */
  duration?: number;
  thumbnails: MusicThumbnail[];
  explicit: boolean;
  kind: MusicTrackKind;
};

export type MusicAlbumKind = "Album" | "Single" | "EP" | "Compilation";

export type MusicAlbum = {
  browseId: string;
  /** The `OLAK5uy_…` playlist yt-dlp resolves an album to. */
  playlistId?: string;
  title: string;
  artists: MusicArtistRef[];
  kind: MusicAlbumKind;
  year?: number;
  trackCount?: number;
  thumbnails: MusicThumbnail[];
};

export type MusicAlbumDetail = {
  album: MusicAlbum;
  description?: string;
  tracks: MusicTrack[];
};

export type MusicPlaylist = {
  /** The bare playlist id, without the `VL` browse prefix. */
  id: string;
  title: string;
  author?: string;
  trackCount?: number;
  thumbnails: MusicThumbnail[];
};

export type MusicPlaylistDetail = {
  playlist: MusicPlaylist;
  tracks: MusicTrack[];
  continuation?: string;
};

export type MusicPlaylistPage = {
  tracks: MusicTrack[];
  continuation?: string;
};

export type MusicArtist = {
  browseId: string;
  name: string;
  description?: string;
  subscribers?: string;
  thumbnails: MusicThumbnail[];
  topTracks: MusicTrack[];
  albums: MusicAlbum[];
  singles: MusicAlbum[];
};

/** The kinds of page a shelf card can open when it is not an album or a playlist. */
export type MusicPageType = "artist" | "podcast" | "profile" | "genre" | "page";

/** A page YouTube Music links to by browse id, e.g. a mood or an artist. */
export type MusicPageRef = {
  browseId: string;
  params?: string;
  title: string;
  pageType: MusicPageType;
  thumbnails: MusicThumbnail[];
};

export type MusicItem =
  | { track: MusicTrack }
  | { album: MusicAlbum }
  | { playlist: MusicPlaylist }
  | { page: MusicPageRef };

export type MusicShelf = { title?: string; items: MusicItem[] };

const EXPLICIT_BADGE = "MUSIC_EXPLICIT_BADGE";
const ALBUM_PAGE = "MUSIC_PAGE_TYPE_ALBUM";
const PLAYLIST_PAGE = "MUSIC_PAGE_TYPE_PLAYLIST";

const PAGE_TYPES: Record<string, MusicPageType> = {
  MUSIC_PAGE_TYPE_ARTIST: "artist",
  MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE: "podcast",
  MUSIC_PAGE_TYPE_USER_CHANNEL: "profile",
};

// --- nav.rs ----------------------------------------------------------------

function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `Value::at`: walks object keys and array indices, one segment at a time. */
export function at(node: unknown, path: string[]): unknown {
  let current: unknown = node;
  for (const key of path) {
    const record = asRecord(current);
    if (record) {
      current = record[key];
      continue;
    }

    const list = asArray(current);
    const index = Number(key);
    if (list.length === 0 || !Number.isInteger(index)) return undefined;
    current = list[index];
  }

  return current;
}

export function strAt(node: unknown, path: string[]): string | undefined {
  return asString(at(node, path));
}

export function itemsAt(node: unknown, path: string[]): unknown[] {
  return asArray(at(node, path));
}

/** `Value::run_text`: a plain string, a `simpleText`, or the joined `runs`. */
export function runText(node: unknown, path: string[] = []): string | undefined {
  const target = path.length === 0 ? node : at(node, path);
  const direct = asString(target);
  if (direct !== undefined) return direct;

  const simple = strAt(target, ["simpleText"]);
  if (simple !== undefined) return simple;

  const runs = asArray(at(target, ["runs"]));
  const text = runs.map((run) => strAt(run, ["text"]) ?? "").join("");
  return text === "" ? undefined : text;
}

/** `Value::runs`: the `runs` list under the path, never the node itself. */
export function runsAt(node: unknown, path: string[]): Raw[] {
  return asArray(at(node, [...path, "runs"])).filter((run): run is Raw => asRecord(run) !== null);
}

function findAll(node: unknown, key: string, out: unknown[] = []): unknown[] {
  const record = asRecord(node);
  if (record) {
    for (const [name, value] of Object.entries(record)) {
      if (name === key) out.push(value);
      else findAll(value, key, out);
    }
    return out;
  }

  for (const value of asArray(node)) findAll(value, key, out);
  return out;
}

export function findRenderer(response: unknown, key: string): unknown {
  return findAll(response, key)[0];
}

export function findRenderers(response: unknown, key: string): unknown[] {
  return findAll(response, key);
}

// --- util.rs ---------------------------------------------------------------

/** `3:05`, `1:02:03`, in seconds; anything else is not a length. */
export function parseClock(text: string): number | undefined {
  if (!text.includes(":")) return undefined;

  let seconds = 0;
  for (const part of text.split(":")) {
    const trimmed = part.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(value) || value < 0) return undefined;
    seconds = seconds * 60 + value;
  }

  return seconds;
}

export function parseYear(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const year = Number(trimmed);
  return year >= 1000 && year <= 9999 ? year : undefined;
}

// --- parse.rs --------------------------------------------------------------

export function thumbnails(node: unknown): MusicThumbnail[] {
  const list = asArray(findAll(node, "thumbnails")[0]);
  const found = list.flatMap((thumb) => {
    const url = strAt(thumb, ["url"]);
    if (!url) return [];
    const width = Number(at(thumb, ["width"]) ?? 0);
    const height = Number(at(thumb, ["height"]) ?? 0);
    return [{ url, width, height }];
  });

  return found.sort((left, right) => (left.width ?? 0) - (right.width ?? 0));
}

function runBrowseId(run: unknown): string | undefined {
  return strAt(run, ["navigationEndpoint", "browseEndpoint", "browseId"]);
}

export function artistRuns(runs: Raw[]): MusicArtistRef[] {
  return runs.flatMap((run) => {
    const name = strAt(run, ["text"]);
    const id = runBrowseId(run);
    if (!name || !id?.startsWith("UC")) return [];
    return [{ name, id }];
  });
}

function albumRun(runs: Raw[]): MusicAlbumRef | undefined {
  for (const run of runs) {
    const id = runBrowseId(run);
    if (!id?.startsWith("MPR")) continue;
    const name = strAt(run, ["text"]) ?? "";
    return { name, id };
  }

  return undefined;
}

const SEPARATORS = new Set([" • ", ", ", " & "]);

/** Rows without artist endpoints still print names; numbers end the list. */
function plainArtistRuns(runs: Raw[]): MusicArtistRef[] {
  const artists: MusicArtistRef[] = [];
  for (const run of runs) {
    const text = strAt(run, ["text"]) ?? "";
    if (text === "" || SEPARATORS.has(text)) continue;
    if (/^[0-9:]+$/.test(text)) break;

    const id = runBrowseId(run);
    artists.push(id ? { name: text, id } : { name: text });
  }

  return artists;
}

export function explicit(node: unknown): boolean {
  return findAll(node, "musicInlineBadgeRenderer").some(
    (badge) => strAt(badge, ["icon", "iconType"]) === EXPLICIT_BADGE,
  );
}

export function listItemTrack(item: unknown): MusicTrack | undefined {
  const renderer = asRecord(at(item, ["musicResponsiveListItemRenderer"])) ?? asRecord(item);
  if (!renderer) return undefined;

  const columns = flexColumns(renderer);
  const first = columns[0];
  if (!first) return undefined;
  const title = runText(first, ["text"]);
  if (!title) return undefined;

  const videoId =
    strAt(renderer, ["playlistItemData", "videoId"]) ??
    strAt(first, ["text", "runs", "0", "navigationEndpoint", "watchEndpoint", "videoId"]) ??
    strAt(renderer, [
      "overlay",
      "musicItemThumbnailOverlayRenderer",
      "content",
      "musicPlayButtonRenderer",
      "playNavigationEndpoint",
      "watchEndpoint",
      "videoId",
    ]);

  let artists: MusicArtistRef[] = [];
  let album: MusicAlbumRef | undefined;
  for (const column of columns.slice(1)) {
    const runs = runsAt(column, ["text"]);
    artists = [...artists, ...artistRuns(runs)];
    album = album ?? albumRun(runs);
  }

  const second = columns[1];
  if (artists.length === 0 && second) artists = plainArtistRuns(runsAt(second, ["text"]));

  // the length ends the subtitle, after an album title that may look like one ("4:44")
  const duration =
    runText(itemsAt(renderer, ["fixedColumns"])[0], [
      "musicResponsiveListItemFixedColumnRenderer",
      "text",
    ]) ??
    columns
      .slice(1)
      .reverse()
      .flatMap((column) => runsAt(column, ["text"]))
      .reverse()
      .map((run) => strAt(run, ["text"]) ?? "")
      .find((text) => /^[0-9:]+$/.test(text) && text.includes(":"));

  return {
    videoId,
    title,
    artists,
    album,
    duration: duration === undefined ? undefined : parseClock(duration),
    thumbnails: thumbnails(renderer),
    explicit: explicit(renderer),
    kind: trackKind(first, album !== undefined),
  };
}

function trackKind(firstColumn: Raw, hasAlbum: boolean): MusicTrackKind {
  const videoType = strAt(firstColumn, [
    "text",
    "runs",
    "0",
    "navigationEndpoint",
    "watchEndpoint",
    "watchEndpointMusicSupportedConfigs",
    "watchEndpointMusicConfig",
    "musicVideoType",
  ]);

  if (videoType === undefined) return hasAlbum ? "song" : "video";
  return videoType === "MUSIC_VIDEO_TYPE_ATV" ? "song" : "video";
}

export function albumKind(text: string): MusicAlbumKind | undefined {
  switch (text) {
    case "Album":
      return "Album";
    case "Single":
      return "Single";
    case "EP":
      return "EP";
    case "Compilation":
      return "Compilation";
    default:
      return undefined;
  }
}

export function twoRowAlbum(item: unknown): MusicAlbum | undefined {
  const renderer = asRecord(at(item, ["musicTwoRowItemRenderer"])) ?? asRecord(item);
  if (!renderer) return undefined;

  const browseId = strAt(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"]);
  if (!browseId?.startsWith("MPR") && !browseId?.startsWith("FEmusic_library")) return undefined;

  const title = runText(renderer, ["title"]);
  if (!title) return undefined;

  const subtitleRuns = runsAt(renderer, ["subtitle"]);
  const texts = subtitleRuns.map((run) => strAt(run, ["text"]) ?? "");

  return {
    browseId,
    playlistId: strAt(renderer, [
      "thumbnailOverlay",
      "musicItemThumbnailOverlayRenderer",
      "content",
      "musicPlayButtonRenderer",
      "playNavigationEndpoint",
      "watchPlaylistEndpoint",
      "playlistId",
    ]),
    title,
    artists: subtitleArtists(subtitleRuns),
    kind: texts.map(albumKind).find((kind) => kind !== undefined) ?? "Album",
    year: texts.map(parseYear).find((year) => year !== undefined),
    thumbnails: thumbnails(renderer),
  };
}

function listItemAlbum(item: unknown): MusicAlbum | undefined {
  const renderer = asRecord(at(item, ["musicResponsiveListItemRenderer"])) ?? asRecord(item);
  if (!renderer || pageType(renderer) !== ALBUM_PAGE) return undefined;

  const browseId = browseIdOf(renderer);
  const columns = flexColumns(renderer);
  const title = runText(columns[0], ["text"]);
  if (!browseId || !title) return undefined;

  const runs = subtitleColumn(columns);
  const texts = runs.map((run) => strAt(run, ["text"]) ?? "");

  return {
    browseId,
    playlistId: overlayPlaylistId(renderer),
    title,
    artists: subtitleArtists(runs),
    kind: texts.map(albumKind).find((kind) => kind !== undefined) ?? "Album",
    year: texts.map(parseYear).find((year) => year !== undefined),
    thumbnails: thumbnails(renderer),
  };
}

function twoRowPlaylist(item: unknown): MusicPlaylist | undefined {
  const renderer = asRecord(at(item, ["musicTwoRowItemRenderer"])) ?? asRecord(item);
  if (!renderer) return undefined;

  const browseId = strAt(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"]);
  if (!browseId?.startsWith("VL")) return undefined;

  const title = runText(renderer, ["title"]);
  if (!title) return undefined;

  const subtitleRuns = runsAt(renderer, ["subtitle"]);
  const owned = hasIcon(renderer, "DELETE");
  const author = owned ? undefined : plainAuthor(subtitleRuns);

  return {
    id: browseId.replace(/^VL/, ""),
    title,
    author,
    trackCount: subtitleRuns
      .map((run) => strAt(run, ["text"]) ?? "")
      .map(countFromText)
      .find((count) => count !== undefined),
    thumbnails: thumbnails(renderer),
  };
}

function listItemPlaylist(item: unknown): MusicPlaylist | undefined {
  const renderer = asRecord(at(item, ["musicResponsiveListItemRenderer"])) ?? asRecord(item);
  if (!renderer || pageType(renderer) !== PLAYLIST_PAGE) return undefined;

  const browseId = browseIdOf(renderer);
  const columns = flexColumns(renderer);
  const title = runText(columns[0], ["text"]);
  if (!browseId || !title) return undefined;

  const runs = subtitleColumn(columns);
  const owned = hasIcon(renderer, "DELETE");

  return {
    id: browseId.replace(/^VL/, ""),
    title,
    author: owned ? undefined : (channelAuthor(runs) ?? plainAuthor(runs)),
    trackCount: runs
      .map((run) => strAt(run, ["text"]) ?? "")
      .map(countFromText)
      .find((count) => count !== undefined),
    thumbnails: thumbnails(renderer),
  };
}

function hasIcon(renderer: unknown, wanted: string): boolean {
  return findAll(renderer, "iconType").some((icon) => asString(icon) === wanted);
}

export function countFromText(text: string): number | undefined {
  const [head, tail] = text.split(/\s+/);
  if (head === undefined || tail === undefined) return undefined;
  if (!tail.startsWith("song") && !tail.startsWith("track")) return undefined;

  const count = Number(head.replace(/,/g, ""));
  return Number.isInteger(count) && count >= 0 ? count : undefined;
}

export function shelfContinuation(node: unknown): string | undefined {
  return strAt(node, ["continuations", "0", "nextContinuationData", "continuation"]);
}

function flexColumns(renderer: Raw): Raw[] {
  return itemsAt(renderer, ["flexColumns"]).flatMap((column) => {
    const found = asRecord(at(column, ["musicResponsiveListItemFlexColumnRenderer"]));
    return found ? [found] : [];
  });
}

function subtitleColumn(columns: Raw[]): Raw[] {
  const column = columns[1];
  return column ? runsAt(column, ["text"]) : [];
}

function pageType(renderer: Raw): string | undefined {
  return strAt(renderer, [
    "navigationEndpoint",
    "browseEndpoint",
    "browseEndpointContextSupportedConfigs",
    "browseEndpointContextMusicConfig",
    "pageType",
  ]);
}

function browseIdOf(renderer: Raw): string | undefined {
  return strAt(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"]);
}

function overlayPlaylistId(renderer: Raw): string | undefined {
  const play = at(renderer, [
    "overlay",
    "musicItemThumbnailOverlayRenderer",
    "content",
    "musicPlayButtonRenderer",
    "playNavigationEndpoint",
  ]);
  return (
    strAt(play, ["watchPlaylistEndpoint", "playlistId"]) ??
    strAt(play, ["watchEndpoint", "playlistId"])
  );
}

function subtitleArtists(runs: Raw[]): MusicArtistRef[] {
  const artists = artistRuns(runs);
  if (artists.length > 0) return artists;

  return runs.flatMap((run) => {
    const text = strAt(run, ["text"]);
    if (!text || SEPARATORS.has(text)) return [];
    if (albumKind(text) !== undefined || parseYear(text) !== undefined) return [];
    return [{ name: text }];
  });
}

function channelAuthor(runs: Raw[]): string | undefined {
  for (const run of runs) {
    const id = runBrowseId(run);
    if (id?.startsWith("UC")) {
      const text = strAt(run, ["text"]);
      if (text) return text;
    }
  }

  return undefined;
}

function plainAuthor(runs: Raw[]): string | undefined {
  return runs
    .map((run) => strAt(run, ["text"]) ?? "")
    .find(
      (text) =>
        text !== "" &&
        !SEPARATORS.has(text) &&
        !text.startsWith("Playlist") &&
        !text.includes("view") &&
        !text.includes("song") &&
        !text.includes("track"),
    );
}

// --- Shelves: the home, charts, moods and genre pages, which ytmusic-rs does not read ---

function pageKind(renderer: Raw, browseId: string): MusicPageType {
  const music = pageType(renderer);
  // the library artist rows carry a channel id but no page type
  return PAGE_TYPES[music ?? ""] ?? (browseId.startsWith("UC") ? "artist" : "page");
}

function pageRefOf(renderer: Raw): MusicPageRef | undefined {
  const browseId = browseIdOf(renderer);
  if (!browseId) return undefined;

  const params = strAt(renderer, ["navigationEndpoint", "browseEndpoint", "params"]);
  const page: MusicPageRef = {
    browseId,
    title: runText(renderer, ["title"]) ?? browseId,
    pageType: pageKind(renderer, browseId),
    thumbnails: thumbnails(renderer),
  };
  if (params) page.params = params;
  return page;
}

function genreRef(button: Raw): MusicPageRef | undefined {
  const title = runText(button, ["buttonText"]);
  const browseId = strAt(button, ["clickCommand", "browseEndpoint", "browseId"]);
  if (!title || !browseId) return undefined;

  const params = strAt(button, ["clickCommand", "browseEndpoint", "params"]);
  const page: MusicPageRef = { browseId, title, pageType: "genre", thumbnails: thumbnails(button) };
  if (params) page.params = params;
  return page;
}

/** A two-row card that plays a video rather than opening a page. */
function twoRowTrack(renderer: Raw): MusicTrack | undefined {
  const videoId = strAt(renderer, ["navigationEndpoint", "watchEndpoint", "videoId"]);
  const title = runText(renderer, ["title"]);
  if (!videoId || !title) return undefined;

  return {
    videoId,
    title,
    artists: subtitleArtists(runsAt(renderer, ["subtitle"])),
    thumbnails: thumbnails(renderer),
    explicit: explicit(renderer),
    kind: "video",
  };
}

function responsivePageRef(renderer: Raw): MusicPageRef | undefined {
  const browseId = browseIdOf(renderer);
  if (!browseId) return undefined;

  const params = strAt(renderer, ["navigationEndpoint", "browseEndpoint", "params"]);
  const page: MusicPageRef = {
    browseId,
    title: runText(flexColumns(renderer)[0], ["text"]) ?? browseId,
    pageType: pageKind(renderer, browseId),
    thumbnails: thumbnails(renderer),
  };
  if (params) page.params = params;
  return page;
}

function itemOf(node: unknown): MusicItem | undefined {
  const twoRow = asRecord(at(node, ["musicTwoRowItemRenderer"]));
  if (twoRow) {
    const album = twoRowAlbum(node);
    if (album) return { album };

    const playlist = twoRowPlaylist(node);
    if (playlist) return { playlist };

    const page = pageRefOf(twoRow);
    if (page) return { page };

    const track = twoRowTrack(twoRow);
    return track ? { track } : undefined;
  }

  const row = asRecord(at(node, ["musicResponsiveListItemRenderer"]));
  if (row) {
    const track = listItemTrack(node);
    if (track?.videoId) return { track };

    const album = listItemAlbum(node);
    if (album) return { album };

    const playlist = listItemPlaylist(node);
    if (playlist) return { playlist };

    const page = responsivePageRef(row);
    return page ? { page } : undefined;
  }

  const button = asRecord(at(node, ["musicNavigationButtonRenderer"]));
  if (button) {
    const page = genreRef(button);
    return page ? { page } : undefined;
  }

  return undefined;
}

function shelfOf(title: unknown, contents: unknown): MusicShelf {
  const items = asArray(contents).flatMap((content) => {
    const item = itemOf(content);
    return item ? [item] : [];
  });

  const text = runText(title)?.trim();
  return text === undefined || text === "" ? { items } : { title: text, items };
}

const GROUP_TITLES: Array<[MusicPageType | "track" | "album" | "playlist", string]> = [
  ["track", "Songs"],
  ["album", "Albums"],
  ["artist", "Artists"],
  ["playlist", "Playlists"],
  ["podcast", "Podcasts"],
  ["profile", "Profiles"],
  ["genre", "Genres"],
  ["page", "Pages"],
];

/** Search answers with bare item sections; grouping them keeps the list readable. */
function grouped(items: MusicItem[]): MusicShelf[] {
  const buckets = new Map<string, MusicItem[]>();
  for (const item of items) {
    const key = "track" in item ? "track" : "album" in item ? "album" : "playlist" in item ? "playlist" : item.page.pageType;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  return GROUP_TITLES.flatMap(([key, title]) => {
    const bucket = buckets.get(key);
    return bucket && bucket.length > 0 ? [{ title, items: bucket }] : [];
  });
}

/**
 * Read a `browse` or `search` answer: every shelf it renders, in order. A shelf is
 * visited whole, so its rows are never picked up twice.
 */
export function parseShelves(response: unknown): MusicShelf[] {
  const shelves: MusicShelf[] = [];
  const loose: MusicItem[] = [];

  const visit = (node: unknown): void => {
    const record = asRecord(node);
    if (!record) {
      for (const child of asArray(node)) visit(child);
      return;
    }

    const carousel = asRecord(record.musicCarouselShelfRenderer);
    if (carousel) {
      const header = asRecord(at(carousel, ["header", "musicCarouselShelfBasicHeaderRenderer"]));
      shelves.push(shelfOf(header?.title, carousel.contents));
      return;
    }

    const shelf = asRecord(record.musicShelfRenderer);
    if (shelf) {
      shelves.push(shelfOf(shelf.title, shelf.contents));
      return;
    }

    const grid = asRecord(record.gridRenderer);
    if (grid) {
      const header = asRecord(at(grid, ["header", "gridHeaderRenderer"]));
      shelves.push(shelfOf(header?.title, grid.items));
      return;
    }

    for (const key of ["gridContinuation", "musicShelfContinuation"]) {
      const continuation = asRecord(record[key]);
      if (!continuation) continue;
      shelves.push(shelfOf(undefined, continuation.items ?? continuation.contents));
      return;
    }

    const section = asRecord(record.itemSectionRenderer);
    if (section) {
      for (const content of asArray(section.contents)) {
        const item = itemOf(content);
        if (item) loose.push(item);
      }
      return;
    }

    for (const child of Object.values(record)) visit(child);
  };

  visit(response);

  return [...shelves, ...grouped(loose)].filter((shelf) => shelf.items.length > 0);
}

// --- URLs ------------------------------------------------------------------

export function musicBrowseUrl(browseId: string): string {
  return `https://music.youtube.com/browse/${browseId}`;
}

export function musicTrackUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`;
}

/** Every public video id has a cover at this path, so playback needs no stored thumbnails. */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** The song id behind a watch url; a playlist or browse url has none. */
export function videoIdFromUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const watch = parsed.searchParams.get("v");
  if (watch) return watch;

  const short = /^\/([A-Za-z0-9_-]{11})$/.exec(parsed.pathname);
  return parsed.hostname === "youtu.be" && short ? short[1] : undefined;
}

/** yt-dlp lists a playlist and, through its `OLAK5uy_…` id, an album. */
export function musicPlaylistUrl(playlistId: string): string {
  return `https://music.youtube.com/playlist?list=${playlistId}`;
}
