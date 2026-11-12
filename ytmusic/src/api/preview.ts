import { playerState } from "~/api/mpv";
import type { MusicConfig } from "~/api/player";
import { readQueueTracks } from "~/api/queue";
import {
  LIKED_SONGS,
  LIBRARY_ALBUMS,
  LIBRARY_ARTISTS,
  LIBRARY_SUBSCRIPTIONS,
  MUSIC_CHARTS,
  MUSIC_GENRES,
  MUSIC_HOME,
  musicBrowse,
  musicHistory,
  musicLibraryItems,
  musicLibraryPlaylists,
  musicPlaylistPage,
} from "~/api/ytmusic";
import {
  thumbnailUrl,
  videoIdFromUrl,
  type MusicArtistRef,
  type MusicItem,
  type MusicPageType,
  type MusicShelf,
  type MusicThumbnail,
  type MusicTrack,
} from "~/utils/ytmusic";

/** A row the right pane can show for a page the user has not opened yet. */
export type PreviewRow = {
  title: string;
  subtitle?: string;
  thumbnail?: string;
};

/** A page's own kind, so an artist row says more than YouTube's generic "page". */
const PAGE_KIND: Record<MusicPageType, string | undefined> = {
  artist: "Artist",
  podcast: "Podcast",
  profile: "Profile",
  genre: "Genre",
  page: undefined,
};

/** Enough to recognise a page, not a second list to read. */
const LIMIT = 6;

/**
 * A page preview is fetched the first time its row is selected. The cache is per command
 * process: reopening the launcher fetches again, while moving the selection does not.
 */
const previews = new Map<string, Promise<PreviewRow[]>>();

export function previewFor(key: string, load: () => Promise<PreviewRow[]>): Promise<PreviewRow[]> {
  const found = previews.get(key);
  if (found) return found;

  const promise = load().catch((error: unknown) => {
    previews.delete(key);
    throw error;
  });
  previews.set(key, promise);
  return promise;
}

function artistsOf(artists: MusicArtistRef[]): string | undefined {
  const names = artists.map((artist) => artist.name);
  return names.length > 0 ? names.join(", ") : undefined;
}

function coverOf(thumbnails: MusicThumbnail[]): string | undefined {
  return thumbnails[thumbnails.length - 1]?.url;
}

function rowOfTrack(track: MusicTrack): PreviewRow {
  return {
    title: track.title,
    subtitle: artistsOf(track.artists) ?? (track.kind === "song" ? "Song" : "Music video"),
    thumbnail: coverOf(track.thumbnails) ?? (track.videoId ? thumbnailUrl(track.videoId) : undefined),
  };
}

/** `kind` names the shelf, because a library entry's own page type can be the generic "page". */
function rowOfItem(item: MusicItem, kind?: string): PreviewRow {
  if ("track" in item) return rowOfTrack(item.track);
  if ("album" in item) {
    return {
      title: item.album.title,
      subtitle: artistsOf(item.album.artists) ?? kind ?? item.album.kind,
      thumbnail: coverOf(item.album.thumbnails),
    };
  }
  if ("playlist" in item) {
    return {
      title: item.playlist.title,
      subtitle: item.playlist.author ?? kind ?? "Playlist",
      thumbnail: coverOf(item.playlist.thumbnails),
    };
  }
  return {
    title: item.page.title,
    subtitle: PAGE_KIND[item.page.pageType] ?? kind ?? "Page",
    thumbnail: coverOf(item.page.thumbnails),
  };
}

/** Shelf titles become the subtitle, so a Home preview says where each row came from. */
function rowOfShelf(shelf: MusicShelf, item: MusicItem): PreviewRow {
  const row = rowOfItem(item);
  if (!shelf.title) return row;
  return { ...row, subtitle: row.subtitle ? `${shelf.title} · ${row.subtitle}` : shelf.title };
}

function shelfRows(shelves: MusicShelf[]): PreviewRow[] {
  return shelves.flatMap((shelf) => shelf.items.map((item) => rowOfShelf(shelf, item))).slice(0, LIMIT);
}

export function previewHome(): Promise<PreviewRow[]> {
  return musicBrowse(MUSIC_HOME).then(shelfRows);
}

export function previewGenres(): Promise<PreviewRow[]> {
  return musicBrowse(MUSIC_GENRES).then(shelfRows);
}

export function previewCharts(): Promise<PreviewRow[]> {
  return musicBrowse(MUSIC_CHARTS).then(shelfRows);
}

export function previewHistory(): Promise<PreviewRow[]> {
  return musicHistory().then(shelfRows);
}

export function previewLiked(): Promise<PreviewRow[]> {
  return musicPlaylistPage(LIKED_SONGS).then((page) => page.tracks.slice(0, LIMIT).map(rowOfTrack));
}

function previewLibrary(browseId: string, kind: string): Promise<PreviewRow[]> {
  return musicLibraryItems(browseId).then((items) =>
    items.slice(0, LIMIT).map((item) => rowOfItem(item, kind)),
  );
}

export function previewAlbums(): Promise<PreviewRow[]> {
  return previewLibrary(LIBRARY_ALBUMS, "Album");
}

export function previewArtists(): Promise<PreviewRow[]> {
  return previewLibrary(LIBRARY_ARTISTS, "Artist");
}

export function previewSubscriptions(): Promise<PreviewRow[]> {
  return previewLibrary(LIBRARY_SUBSCRIPTIONS, "Artist");
}

export function previewPlaylists(): Promise<PreviewRow[]> {
  return musicLibraryPlaylists().then((playlists) =>
    playlists.slice(0, LIMIT).map((playlist) => ({
      title: playlist.title,
      subtitle: playlist.author ?? "Playlist",
      thumbnail: coverOf(playlist.thumbnails),
    })),
  );
}

/** Live, so it is never cached: the point is what mpv is doing now. */
export async function previewNowPlaying(config: MusicConfig): Promise<PreviewRow[]> {
  const state = await playerState(config);
  if (!state) return [];

  const tracks = new Map(readQueueTracks(config).map((track) => [track.videoId, track]));
  const current = videoIdFromUrl(state.path ?? "");
  const currentTrack = current ? tracks.get(current) : undefined;
  const volume = state.muted ? `Muted · ${state.volume}%` : `${state.volume}%`;

  return [
    {
      title: state.title ?? currentTrack?.title ?? "Untitled",
      subtitle: [currentTrack?.artists.join(", "), volume].filter(Boolean).join(" · "),
      thumbnail: current ? thumbnailUrl(current) : undefined,
    },
    ...state.queue.slice(state.index, state.index + LIMIT - 1).flatMap((url): PreviewRow[] => {
      const videoId = videoIdFromUrl(url);
      if (!videoId) return [];
      const track = tracks.get(videoId);
      return [
        {
          title: track?.title ?? `Video ${videoId}`,
          subtitle: track?.artists.join(", ") || "Queued",
          thumbnail: track?.thumbnail ?? thumbnailUrl(videoId),
        },
      ];
    }),
  ];
}
