/**
 * What the UI calls a track, an album, a playlist, an artist and a shelf.
 *
 * The shapes are the ones `ytmusic-cli` prints: the Rust half of the extension parses
 * YouTube Music's answers, and these types are the contract between the two halves.
 */

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
  /** The whole playlist's length in seconds, from its header. */
  duration?: number;
  thumbnails: MusicThumbnail[];
};

export type MusicPlaylistDetail = {
  playlist: MusicPlaylist;
  description?: string;
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

/** How long a set of tracks runs: `48 min`, `1 hr 12 min`, `2 hr`. */
export function durationText(seconds: number | undefined): string | undefined {
  const minutes = Math.round((seconds ?? 0) / 60);
  if (minutes <= 0) return undefined;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function totalDuration(tracks: { duration?: number }[]): string | undefined {
  return durationText(tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0));
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

/**
 * The pane's cover: 1280×720, with none of the black bars `hqdefault` keeps above
 * and below the 16:9 frame. Twelve of a hundred uploads do not have it, so the
 * pane keeps `thumbnailUrl` as the fallback.
 */
export function coverUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * The same picture at `size` pixels, for a list row that draws it at 32.
 *
 * YouTube's CDN takes the size in the URL: a library row otherwise downloads a
 * 544×544 cover (~50 KB) and decodes it for a thumbnail. Anything that carries no
 * size, and the 480×360 `hqdefault` variant, falls back to a smaller one.
 */
export function iconUrl(url: string, size = 128): string {
  return url
    .replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
    .replace(/\/hqdefault\.jpg/, "/mqdefault.jpg");
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
