import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  open,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadAuth, type AuthResult } from "~/api/auth";
import { readHistory, recordPlay } from "~/api/history";
import { playQueue, queueUrl, shuffled } from "~/api/mpv";
import {
  buildMusicConfig,
  downloadAudio,
  downloadPlaylistAudio,
  play,
  type MusicConfig,
} from "~/api/player";
import {
  previewAlbums,
  previewArtists,
  previewCharts,
  previewFor,
  previewGenres,
  previewHistory,
  previewHome,
  previewLiked,
  previewNowPlaying,
  previewPlaylists,
  previewSubscriptions,
  type PreviewRow,
} from "~/api/preview";
import { rememberTracks } from "~/api/queue";
import {
  LIBRARY_ALBUMS,
  LIBRARY_ARTISTS,
  LIBRARY_PLAYLISTS,
  LIBRARY_SUBSCRIPTIONS,
  LIKED_SONGS,
  MUSIC_CHARTS,
  MUSIC_GENRES,
  MUSIC_HOME,
  addTrackToPlaylist,
  isSignedIn,
  likePlaylist,
  likeTrack,
  musicAlbum,
  musicArtist,
  musicBrowse,
  musicDiscography,
  musicHistory,
  musicLibraryItems,
  musicLibraryPlaylists,
  musicPlaylistContinuation,
  musicPlaylistPage,
  searchMusic,
  setAuth,
  type SearchFilter,
} from "~/api/ytmusic";
import { NowPlayingView } from "~/now-playing";
import {
  musicBrowseUrl,
  musicPlaylistUrl,
  musicTrackUrl,
  type MusicAlbum,
  type MusicArtist,
  type MusicItem,
  type MusicPageRef,
  type MusicPlaylist,
  type MusicShelf,
  type MusicThumbnail,
  type MusicTrack,
} from "~/utils/ytmusic";

const PAGES = [
  {
    title: "Music Home",
    subtitle: "YouTube Music's shelves: quick picks, new releases and more",
    browseId: MUSIC_HOME,
    icon: Icon.Music,
  },
  {
    title: "Moods & Genres",
    subtitle: "Browse YouTube Music by mood and by genre",
    browseId: MUSIC_GENRES,
    icon: Icon.Waveform,
  },
  {
    title: "Charts",
    subtitle: "YouTube Music's charts, global and by country",
    browseId: MUSIC_CHARTS,
    icon: Icon.LineChart,
  },
];

const SEARCH_FILTERS: Array<{ title: string; value: SearchFilter }> = [
  { title: "All", value: "all" },
  { title: "Songs", value: "songs" },
  { title: "Videos", value: "videos" },
  { title: "Albums", value: "albums" },
  { title: "Artists", value: "artists" },
  { title: "Playlists", value: "playlists" },
];

const PAGE_NAMES: Record<MusicPageRef["pageType"], string> = {
  artist: "Artist",
  podcast: "Podcast",
  profile: "Profile",
  genre: "Mood or genre",
  page: "Page",
};

const PAGE_ICONS: Record<MusicPageRef["pageType"], Icon> = {
  artist: Icon.PersonCircle,
  podcast: Icon.Microphone,
  profile: Icon.Person,
  genre: Icon.Waveform,
  page: Icon.Music,
};

type Field = { title: string; text: string };

type Props = { config: MusicConfig };

type Preferences = {
  player?: string;
  playerArgs?: string;
  playerWindow?: boolean;
  downloadDir?: string;
  cookies?: string;
  cookiesFile?: string;
  authUser?: string;
};

async function attempt(failureTitle: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    await showToast(
      Toast.Style.Failure,
      failureTitle,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** A queue the player did not start: remember its titles, but never fail the play over a cache. */
function remember(config: MusicConfig, tracks: MusicTrack[]): void {
  try {
    rememberTracks(config, tracks);
  } catch {
    // the queue is a convenience; a read-only cache folder must not block playback
  }
}

function startPlay(url: string, config: MusicConfig): void {
  void attempt("Could not start the player", () => play(url, config));
}

function startQueue(track: MusicTrack, config: MusicConfig, next: boolean): void {
  const videoId = track.videoId;
  if (!videoId) return;
  remember(config, [track]);
  void attempt("Could not add to the queue", () => queueUrl(musicTrackUrl(videoId), config, next));
}

function trackUrls(tracks: MusicTrack[]): string[] {
  return tracks.flatMap((track) => (track.videoId ? [musicTrackUrl(track.videoId)] : []));
}

/** Play All: a public song queue in mpv, or the playlist URL for any other player. */
function startPlayTracks(
  tracks: MusicTrack[],
  config: MusicConfig,
  fallbackUrl: string,
  shuffle = false,
): void {
  const urls = shuffle ? shuffled(trackUrls(tracks)) : trackUrls(tracks);
  remember(config, tracks);
  if (config.player !== "mpv" || urls.length === 0) {
    startPlay(fallbackUrl, config);
    return;
  }

  void attempt("Could not start the player", () => playQueue(urls, config));
}

/** A playlist row has no tracks loaded yet; loading them keeps a private playlist playable. */
function startPlaylistTracks(playlistId: string, config: MusicConfig, shuffle = false): void {
  void attempt("Could not start the player", async () => {
    const tracks = (await musicPlaylistPage(playlistId)).tracks;
    remember(config, tracks);
    const urls = trackUrls(tracks);
    if (config.player !== "mpv" || urls.length === 0) {
      await play(musicPlaylistUrl(playlistId), config);
      return;
    }
    await playQueue(shuffle ? shuffled(urls) : urls, config);
  });
}

/** Playing records the song first: a failed player must not lose the history entry. */
function startTrack(track: MusicTrack, config: MusicConfig): void {
  const videoId = track.videoId;
  if (!videoId) return;

  try {
    recordPlay(config, track);
  } catch {
    // the history is a convenience; a read-only cache folder must not block playback
  }
  remember(config, [track]);
  startPlay(musicTrackUrl(videoId), config);
}

function startDownload(url: string, config: MusicConfig): void {
  void attempt("Could not start the download", () => downloadAudio(url, config));
}

function startPlaylistDownload(url: string, title: string, config: MusicConfig): void {
  void attempt("Could not start the download", () => downloadPlaylistAudio(url, title, config));
}

function startLike(videoId: string, title: string): void {
  void attempt(`Could not like ${title}`, () =>
    likeTrack(videoId, true).then(async () => {
      await showToast(Toast.Style.Success, "Liked", title);
    }),
  );
}

function startSave(playlistId: string, title: string): void {
  void attempt(`Could not save ${title}`, () =>
    likePlaylist(playlistId, true).then(async () => {
      await showToast(Toast.Style.Success, "Saved", title);
    }),
  );
}

/** Titles can carry markdown punctuation; the pane is markdown. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#]/g, "\\$&");
}

function thumbnailOf(thumbnails: MusicThumbnail[]): string | undefined {
  return thumbnails[thumbnails.length - 1]?.url;
}

function iconFor(thumbnails: MusicThumbnail[], fallback: Icon) {
  const url = thumbnailOf(thumbnails);
  return url ? { source: url } : fallback;
}

/** The side pane: the cover, the title and the facts the row does not show. */
function Detail({
  title,
  subtitle,
  thumbnails,
  description,
  fields = [],
}: {
  title: string;
  subtitle?: string;
  thumbnails: MusicThumbnail[];
  description?: string;
  fields?: Field[];
}) {
  const thumbnail = thumbnailOf(thumbnails);
  const markdown = [
    thumbnail ? `![](${thumbnail})` : "",
    `**${escapeMarkdown(title)}**`,
    subtitle ? escapeMarkdown(subtitle) : "",
    description?.trim() ? escapeMarkdown(description.trim()) : "",
  ]
    .filter((part) => part !== "")
    .join("\n\n");

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        fields.length > 0 ? (
          <List.Item.Detail.Metadata>
            {fields.map((field) => (
              <List.Item.Detail.Metadata.Label key={field.title} title={field.title} text={field.text} />
            ))}
          </List.Item.Detail.Metadata>
        ) : undefined
      }
    />
  );
}

/** Loads a page once; `load` must be stable for the lifetime of the view. */
function useLoaded<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setValue(undefined);
    setProblem(null);
    setIsLoading(true);

    load()
      .then((found) => {
        if (!cancelled) setValue(found);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  return { value, problem, isLoading };
}

function EmptyView({ problem, what }: { problem: string | null; what: string }) {
  return (
    <List.EmptyView
      icon={problem ? Icon.Warning : Icon.Music}
      title={problem ? `Could not load the ${what}` : `Nothing in this ${what}`}
      description={problem ?? "Try another page, or search YouTube Music."}
    />
  );
}

function previewForPage(browseId: string): () => Promise<PreviewRow[]> {
  if (browseId === MUSIC_HOME) return previewHome;
  if (browseId === MUSIC_GENRES) return previewGenres;
  return previewCharts;
}

/**
 * The right pane: the description above, what the page holds in the metadata rows below. Rows
 * load only for the selected item, and a cached page is fetched once per command process.
 */
function PreviewDetail({
  markdown,
  load,
  cacheKey,
}: {
  markdown: string;
  load: () => Promise<PreviewRow[]>;
  cacheKey?: string;
}) {
  const loader = useRef(load);
  loader.current = load;

  const [rows, setRows] = useState<PreviewRow[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(undefined);
    setProblem(null);

    const promise = cacheKey ? previewFor(cacheKey, loader.current) : loader.current();
    promise.then(
      (found) => {
        if (!cancelled) setRows(found);
      },
      (error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          {rows === undefined && problem === null ? (
            <List.Item.Detail.Metadata.Label title="Preview" text="Loading…" />
          ) : null}
          {problem ? (
            <List.Item.Detail.Metadata.Label title="Preview" text={problem} icon={Icon.Warning} />
          ) : null}
          {rows && rows.length === 0 ? (
            <List.Item.Detail.Metadata.Label title="Preview" text="Nothing to show" />
          ) : null}
          {rows?.map((row, index) => (
            <List.Item.Detail.Metadata.Label
              key={`${index}:${row.title}`}
              title={row.title}
              text={row.subtitle ?? ""}
              icon={row.thumbnail}
            />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function artistsOf(artists: { name: string }[]): string {
  return artists.map((artist) => artist.name).join(", ");
}

function trackFields(track: MusicTrack): Field[] {
  const fields: Field[] = [{ title: "Type", text: track.kind === "song" ? "Song" : "Music video" }];
  if (track.album) fields.push({ title: "Album", text: track.album.name });
  if (track.explicit) fields.push({ title: "Explicit", text: "Yes" });
  return fields;
}

function albumFields(album: MusicAlbum): Field[] {
  const fields: Field[] = [{ title: "Type", text: album.kind }];
  const artists = artistsOf(album.artists);
  if (artists !== "") fields.push({ title: "Artist", text: artists });
  if (album.year !== undefined) fields.push({ title: "Year", text: String(album.year) });
  if (album.trackCount !== undefined) fields.push({ title: "Tracks", text: String(album.trackCount) });
  return fields;
}

function playlistFields(playlist: MusicPlaylist): Field[] {
  const fields: Field[] = [];
  if (playlist.author) fields.push({ title: "Author", text: playlist.author });
  if (playlist.trackCount !== undefined) fields.push({ title: "Tracks", text: String(playlist.trackCount) });
  return fields;
}

function artistFields(artist: MusicArtist): Field[] {
  return artist.subscribers ? [{ title: "Subscribers", text: artist.subscribers }] : [];
}

function TrackRow({ track, config }: { track: MusicTrack; config: MusicConfig }) {
  const videoId = track.videoId;
  if (!videoId) return null;
  const url = musicTrackUrl(videoId);
  const artists = artistsOf(track.artists);
  const signedIn = isSignedIn();
  const queued = config.player === "mpv";

  return (
    <List.Item
      title={track.title}
      subtitle={artists || undefined}
      icon={iconFor(track.thumbnails, Icon.Music)}
      keywords={track.artists.map((artist) => artist.name)}
      detail={<Detail title={track.title} subtitle={artists} thumbnails={track.thumbnails} fields={trackFields(track)} />}
      actions={
        <ActionPanel>
          <Action title="Play" icon={Icon.Play} shortcut="open" onAction={() => startTrack(track, config)} />
          {queued ? (
            <Action
              title="Play Next"
              icon={Icon.Forward}
              shortcut={{ modifiers: ["ctrl"], key: "n" }}
              onAction={() => startQueue(track, config, true)}
            />
          ) : null}
          {queued ? (
            <Action
              title="Add to Queue"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["ctrl"], key: "q" }}
              onAction={() => startQueue(track, config, false)}
            />
          ) : null}
          {signedIn ? (
            <Action
              title="Like"
              icon={Icon.Heart}
              shortcut={{ modifiers: ["ctrl"], key: "l" }}
              onAction={() => startLike(videoId, track.title)}
            />
          ) : null}
          {signedIn ? (
            <Action.Push
              title="Add to Playlist"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
              target={<AddToPlaylistView track={track} config={config} />}
            />
          ) : null}
          <Action
            title="Download Audio"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "a" }}
            onAction={() => startDownload(url, config)}
          />
          <Action.OpenInBrowser
            title="Open in YouTube Music"
            url={url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy URL" content={url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

function AlbumRow({ album, ...props }: Props & { album: MusicAlbum }) {
  const url = musicBrowseUrl(album.browseId);
  const playlistId = album.playlistId;
  return (
    <List.Item
      title={album.title}
      subtitle={artistsOf(album.artists) || undefined}
      icon={iconFor(album.thumbnails, Icon.Music)}
      keywords={album.artists.map((artist) => artist.name)}
      detail={
        <Detail
          title={album.title}
          subtitle={artistsOf(album.artists)}
          thumbnails={album.thumbnails}
          fields={albumFields(album)}
        />
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Open Album"
            icon={Icon.Music}
            shortcut="open"
            target={<AlbumView browseId={album.browseId} title={album.title} {...props} />}
          />
          {playlistId && isSignedIn() ? (
            <Action
              title="Save Album"
              icon={Icon.Heart}
              shortcut={{ modifiers: ["ctrl"], key: "l" }}
              onAction={() => startSave(playlistId, album.title)}
            />
          ) : null}
          <Action.OpenInBrowser
            title="Open in YouTube Music"
            url={url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy URL" content={url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

function PlaylistRow({ playlist, ...props }: Props & { playlist: MusicPlaylist }) {
  const url = musicPlaylistUrl(playlist.id);
  return (
    <List.Item
      title={playlist.title}
      subtitle={playlist.author}
      icon={iconFor(playlist.thumbnails, Icon.BulletPoints)}
      keywords={playlist.author ? [playlist.author] : []}
      detail={
        <Detail
          title={playlist.title}
          subtitle={playlist.author}
          thumbnails={playlist.thumbnails}
          fields={playlistFields(playlist)}
        />
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Open Playlist"
            icon={Icon.BulletPoints}
            shortcut="open"
            target={<PlaylistView playlistId={playlist.id} title={playlist.title} {...props} />}
          />
          <Action
            title="Play All"
            icon={Icon.Play}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
            onAction={() => startPlaylistTracks(playlist.id, props.config)}
          />
          <Action
            title="Shuffle Play"
            icon={Icon.Shuffle}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
            onAction={() => startPlaylistTracks(playlist.id, props.config, true)}
          />
          {isSignedIn() ? (
            <Action
              title="Save Playlist"
              icon={Icon.Heart}
              shortcut={{ modifiers: ["ctrl"], key: "l" }}
              onAction={() => startSave(playlist.id, playlist.title)}
            />
          ) : null}
          <Action
            title="Download All"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
            onAction={() => startPlaylistDownload(url, playlist.title, props.config)}
          />
          <Action.OpenInBrowser
            title="Open in YouTube Music"
            url={url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy URL" content={url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

function PageRow({ page, ...props }: Props & { page: MusicPageRef }) {
  const url = musicBrowseUrl(page.browseId);
  const target =
    page.pageType === "artist" ? (
      <ArtistView browseId={page.browseId} title={page.title} {...props} />
    ) : (
      <ShelvesView title={page.title} browseId={page.browseId} params={page.params} {...props} />
    );

  return (
    <List.Item
      title={page.title}
      icon={iconFor(page.thumbnails, PAGE_ICONS[page.pageType])}
      detail={
        <Detail
          title={page.title}
          thumbnails={page.thumbnails}
          fields={[{ title: "Type", text: PAGE_NAMES[page.pageType] }]}
        />
      }
      actions={
        <ActionPanel>
          <Action.Push
            title={`Open ${PAGE_NAMES[page.pageType]}`}
            icon={PAGE_ICONS[page.pageType]}
            shortcut="open"
            target={target}
          />
          <Action.OpenInBrowser
            title="Open in YouTube Music"
            url={url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy URL" content={url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

function ItemRow({ item, ...props }: Props & { item: MusicItem }) {
  if ("track" in item) return <TrackRow track={item.track} config={props.config} />;
  if ("album" in item) return <AlbumRow album={item.album} {...props} />;
  if ("playlist" in item) return <PlaylistRow playlist={item.playlist} {...props} />;
  return <PageRow page={item.page} {...props} />;
}

function itemKey(item: MusicItem): string {
  if ("track" in item) return `track:${item.track.videoId ?? item.track.title}`;
  if ("album" in item) return `album:${item.album.browseId}`;
  if ("playlist" in item) return `playlist:${item.playlist.id}`;
  return `page:${item.page.browseId}:${item.page.title}`;
}

function ShelfSections({ shelves, ...props }: Props & { shelves: MusicShelf[] }) {
  return (
    <>
      {shelves.map((shelf, index) => (
        <List.Section key={`${shelf.title ?? "shelf"}:${index}`} title={shelf.title}>
          {shelf.items.map((item, itemIndex) => (
            <ItemRow key={`${itemKey(item)}:${itemIndex}`} item={item} {...props} />
          ))}
        </List.Section>
      ))}
    </>
  );
}

/** A YouTube Music page ytmusic-rs has no model for: home, charts, moods, genres. */
function ShelvesView({
  title,
  browseId,
  params,
  ...props
}: Props & { title: string; browseId: string; params?: string }) {
  const load = useCallback(() => musicBrowse(browseId, params), [browseId, params]);
  const { value, problem, isLoading } = useLoaded(load);
  const shelves = value ?? [];

  return (
    <List
      navigationTitle={title}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder={`Filter ${title.toLowerCase()}`}
    >
      <ShelfSections shelves={shelves} {...props} />
      {shelves.length === 0 && !isLoading ? <EmptyView problem={problem} what="page" /> : null}
    </List>
  );
}

function AlbumView({ browseId, title, ...props }: Props & { browseId: string; title: string }) {
  const load = useCallback(() => musicAlbum(browseId), [browseId]);
  const { value, problem, isLoading } = useLoaded(load);
  const album = value?.album;
  const playlistId = album?.playlistId;
  const playlistUrl = playlistId ? musicPlaylistUrl(playlistId) : undefined;

  return (
    <List
      navigationTitle={album?.title ?? title}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Filter the album"
    >
      {album ? (
        <List.Section title={album.kind}>
          <List.Item
            title={album.title}
            subtitle={artistsOf(album.artists)}
            icon={iconFor(album.thumbnails, Icon.Music)}
            detail={
              <Detail
                title={album.title}
                subtitle={artistsOf(album.artists)}
                thumbnails={album.thumbnails}
                description={value?.description}
                fields={albumFields(album)}
              />
            }
            actions={
              <ActionPanel>
                {playlistUrl ? (
                  <Action
                    title="Play All"
                    icon={Icon.Play}
                    shortcut="open"
                    onAction={() => startPlayTracks(value?.tracks ?? [], props.config, playlistUrl)}
                  />
                ) : null}
                {playlistUrl ? (
                  <Action
                    title="Shuffle Play"
                    icon={Icon.Shuffle}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                    onAction={() =>
                      startPlayTracks(value?.tracks ?? [], props.config, playlistUrl, true)
                    }
                  />
                ) : null}
                {playlistId && isSignedIn() ? (
                  <Action
                    title="Save Album"
                    icon={Icon.Heart}
                    shortcut={{ modifiers: ["ctrl"], key: "l" }}
                    onAction={() => startSave(playlistId, album.title)}
                  />
                ) : null}
                {playlistUrl ? (
                  <Action
                    title="Download All"
                    icon={Icon.Download}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
                    onAction={() => startPlaylistDownload(playlistUrl, album.title, props.config)}
                  />
                ) : null}
                <Action.OpenInBrowser
                  title="Open in YouTube Music"
                  url={musicBrowseUrl(browseId)}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
                />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={musicBrowseUrl(browseId)}
                  shortcut="copy"
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      {(value?.tracks.length ?? 0) > 0 ? (
        <List.Section title="Tracks">
          {(value?.tracks ?? []).map((track, index) => (
            <TrackRow key={`${track.videoId ?? track.title}:${index}`} track={track} config={props.config} />
          ))}
        </List.Section>
      ) : null}
      {!album && !isLoading ? <EmptyView problem={problem} what="album" /> : null}
    </List>
  );
}

function PlaylistView({
  playlistId,
  title,
  ...props
}: Props & { playlistId: string; title: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof musicPlaylistPage>> | undefined>(undefined);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const url = musicPlaylistUrl(playlistId);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    musicPlaylistPage(playlistId)
      .then((found) => {
        if (cancelled) return;
        setDetail(found);
        setTracks(found.tracks);
        setToken(found.continuation);
        setProblem(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProblem(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const loadMore = async (): Promise<void> => {
    if (!token || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const page = await musicPlaylistContinuation(token);
      setTracks((previous) => [...previous, ...page.tracks]);
      setToken(page.continuation);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setToken(undefined);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const playlist = detail?.playlist;

  return (
    <List
      navigationTitle={playlist?.title ?? title}
      isLoading={isLoading || isLoadingMore}
      isShowingDetail
      searchBarPlaceholder="Filter the playlist"
      pagination={token ? { hasMore: true, onLoadMore: loadMore } : undefined}
    >
      {playlist ? (
        <List.Section title="Playlist">
          <List.Item
            title={playlist.title}
            subtitle={playlist.author}
            icon={iconFor(playlist.thumbnails, Icon.BulletPoints)}
            detail={
              <Detail
                title={playlist.title}
                subtitle={playlist.author}
                thumbnails={playlist.thumbnails}
                fields={playlistFields(playlist)}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Play All"
                  icon={Icon.Play}
                  shortcut="open"
                  onAction={() => startPlayTracks(tracks, props.config, url)}
                />
                <Action
                  title="Shuffle Play"
                  icon={Icon.Shuffle}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                  onAction={() => startPlayTracks(tracks, props.config, url, true)}
                />
                {isSignedIn() && playlist.id !== LIKED_SONGS ? (
                  <Action
                    title="Save Playlist"
                    icon={Icon.Heart}
                    shortcut={{ modifiers: ["ctrl"], key: "l" }}
                    onAction={() => startSave(playlist.id, playlist.title)}
                  />
                ) : null}
                <Action
                  title="Download All"
                  icon={Icon.Download}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
                  onAction={() => startPlaylistDownload(url, playlist.title, props.config)}
                />
                <Action.OpenInBrowser
                  title="Open in YouTube Music"
                  url={url}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
                />
                <Action.CopyToClipboard title="Copy URL" content={url} shortcut="copy" />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      {tracks.length > 0 ? (
        <List.Section title="Tracks">
          {tracks.map((track, index) => (
            <TrackRow key={`${track.videoId ?? track.title}:${index}`} track={track} config={props.config} />
          ))}
        </List.Section>
      ) : null}
      {tracks.length === 0 && !isLoading ? <EmptyView problem={problem} what="playlist" /> : null}
    </List>
  );
}

function ArtistView({ browseId, title, ...props }: Props & { browseId: string; title: string }) {
  const load = useCallback(() => musicArtist(browseId), [browseId]);
  const { value, problem, isLoading } = useLoaded(load);

  return (
    <List
      navigationTitle={value?.name ?? title}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Filter the artist's songs and releases"
    >
      {value ? (
        <List.Section title={value.name}>
          <List.Item
            title={value.name}
            subtitle={value.subscribers}
            icon={iconFor(value.thumbnails, Icon.PersonCircle)}
            detail={
              <Detail
                title={value.name}
                subtitle={value.subscribers}
                thumbnails={value.thumbnails}
                description={value.description}
                fields={artistFields(value)}
              />
            }
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open in YouTube Music"
                  url={musicBrowseUrl(browseId)}
                  shortcut="open"
                />
                <Action.CopyToClipboard title="Copy URL" content={musicBrowseUrl(browseId)} shortcut="copy" />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      {value && value.topTracks.length > 0 ? (
        <List.Section title="Top songs">
          {value.topTracks.map((track, index) => (
            <TrackRow key={`${track.videoId ?? track.title}:${index}`} track={track} config={props.config} />
          ))}
        </List.Section>
      ) : null}
      {value && value.albums.length > 0 ? (
        <List.Section title="Albums">
          {value.albums.map((album) => (
            <AlbumRow key={album.browseId} album={album} {...props} />
          ))}
        </List.Section>
      ) : null}
      {value && value.singles.length > 0 ? (
        <List.Section title="Singles & EPs">
          {value.singles.map((album) => (
            <AlbumRow key={album.browseId} album={album} {...props} />
          ))}
        </List.Section>
      ) : null}
      {value ? (
        <List.Section title="Everything">
          <List.Item
            title="All releases"
            subtitle="The artist's full discography"
            icon={Icon.BulletPoints}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open All Releases"
                  icon={Icon.BulletPoints}
                  shortcut="open"
                  target={
                    <DiscographyView
                      channelId={browseId}
                      title={`All releases · ${value.name}`}
                      {...props}
                    />
                  }
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      {!value && !isLoading ? <EmptyView problem={problem} what="artist" /> : null}
    </List>
  );
}

function DiscographyView({
  channelId,
  title,
  ...props
}: Props & { channelId: string; title: string }) {
  const load = useCallback(() => musicDiscography(channelId), [channelId]);
  const { value, problem, isLoading } = useLoaded(load);
  const albums = value ?? [];

  return (
    <List
      navigationTitle={title}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Filter the releases"
    >
      {albums.length > 0 ? (
        <List.Section title="Releases">
          {albums.map((album) => (
            <AlbumRow key={album.browseId} album={album} {...props} />
          ))}
        </List.Section>
      ) : null}
      {albums.length === 0 && !isLoading ? <EmptyView problem={problem} what="discography" /> : null}
    </List>
  );
}

/** A library page: saved albums, artists, playlists or the channels the user follows. */
function LibraryView({ browseId, title, ...props }: Props & { browseId: string; title: string }) {
  const load = useCallback(() => musicLibraryItems(browseId), [browseId]);
  const { value, problem, isLoading } = useLoaded(load);
  // the playlists grid starts with a create card and lists `LM` again; the Liked songs row has it
  const items = (value ?? []).filter((item) => {
    if (browseId !== LIBRARY_PLAYLISTS) return true;
    return "playlist" in item && item.playlist.id !== LIKED_SONGS;
  });

  return (
    <List
      navigationTitle={title}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder={`Filter ${title.toLowerCase()}`}
    >
      {items.length > 0 ? (
        <List.Section title={title}>
          {items.map((item, index) => (
            <ItemRow key={`${itemKey(item)}:${index}`} item={item} {...props} />
          ))}
        </List.Section>
      ) : null}
      {items.length === 0 && !isLoading ? <EmptyView problem={problem} what={title.toLowerCase()} /> : null}
    </List>
  );
}

function HistoryView(props: Props) {
  const load = useCallback(() => musicHistory(), []);
  const { value, problem, isLoading } = useLoaded(load);
  const shelves = value ?? [];

  return (
    <List navigationTitle="History" isLoading={isLoading} isShowingDetail searchBarPlaceholder="Filter the history">
      <ShelfSections shelves={shelves} {...props} />
      {shelves.length === 0 && !isLoading ? <EmptyView problem={problem} what="history" /> : null}
    </List>
  );
}

/** Every saved playlist, so a song can be added to one. */
function AddToPlaylistView({ track, config }: { track: MusicTrack; config: MusicConfig }) {
  const load = useCallback(() => musicLibraryPlaylists(), []);
  const { value, problem, isLoading } = useLoaded(load);
  const playlists = value ?? [];
  const videoId = track.videoId;

  return (
    <List
      navigationTitle={`Add ${track.title} to a playlist`}
      isLoading={isLoading}
      searchBarPlaceholder="Filter your playlists"
    >
      {playlists.length > 0 && videoId ? (
        <List.Section title="Your playlists">
          {playlists.map((playlist) => (
            <List.Item
              key={playlist.id}
              title={playlist.title}
              subtitle={playlist.author}
              icon={iconFor(playlist.thumbnails, Icon.BulletPoints)}
              actions={
                <ActionPanel>
                  <Action
                    title="Add to This Playlist"
                    icon={Icon.Plus}
                    shortcut="open"
                    onAction={() =>
                      void attempt(`Could not add to ${playlist.title}`, () =>
                        addTrackToPlaylist(playlist.id, videoId).then(async () => {
                          await showToast(
                            Toast.Style.Success,
                            "Added",
                            `${track.title} → ${playlist.title}`,
                          );
                        }),
                      )
                    }
                  />
                  <Action.Push
                    title="Open Playlist"
                    icon={Icon.BulletPoints}
                    shortcut={{ modifiers: ["ctrl"], key: "o" }}
                    target={<PlaylistView playlistId={playlist.id} title={playlist.title} config={config} />}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
      {playlists.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={problem ? Icon.Warning : Icon.BulletPoints}
          title={problem ? "Could not load your playlists" : "No playlists yet"}
          description={problem ?? "Create a playlist in YouTube Music, then it appears here."}
        />
      ) : null}
    </List>
  );
}

function PlayedRow({ played, config }: { played: ReturnType<typeof readHistory>[number]; config: MusicConfig }) {
  const track: MusicTrack = {
    videoId: played.videoId,
    title: played.title,
    artists: played.artists.map((name) => ({ name })),
    thumbnails: played.thumbnail ? [{ url: played.thumbnail }] : [],
    explicit: false,
    kind: "song",
  };

  return <TrackRow track={track} config={config} />;
}

/** The cookie sign-in the manifest describes, run once per command process and again on demand. */
function useSession(): [AuthResult, () => void] {
  const [session, setSession] = useState<AuthResult>(() => {
    const result = loadAuth(getPreferenceValues<Preferences>());
    setAuth(result.auth);
    return result;
  });

  const refresh = useCallback(() => {
    const result = loadAuth(getPreferenceValues<Preferences>());
    setAuth(result.auth);
    setSession(result);
    void showToast(
      result.auth ? Toast.Style.Success : Toast.Style.Failure,
      result.auth ? "Signed in" : "No session found",
      result.auth
        ? undefined
        : result.problem ??
            "Sign in at music.youtube.com in Firefox, Brave, Chrome, Chromium, Edge or Vivaldi, then read again.",
    );
  }, []);

  return [session, refresh];
}

/** Opens the sign-in page once, so a machine with no stored session has one to read later. */
function useBrowserSignIn(signedIn: boolean, cacheDir: string): void {
  useEffect(() => {
    if (signedIn) return;

    const marker = join(cacheDir, "sign-in-opened");
    if (existsSync(marker)) return;

    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(marker, "");
    } catch {
      return;
    }

    void open("https://music.youtube.com").catch(() => undefined);
  }, [signedIn, cacheDir]);
}

export default function MusicCommand() {
  const [config] = useState(() => buildMusicConfig(getPreferenceValues<Preferences>()));
  const [session, refreshSession] = useSession();
  useBrowserSignIn(session.auth !== null, config.cacheDir);
  const [history] = useState(() => readHistory(config));
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [shelves, setShelves] = useState<MusicShelf[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const trimmed = text.trim();
  const signedIn = session.auth !== null;

  useEffect(() => {
    if (trimmed.length < 2) {
      setShelves([]);
      setProblem(null);
      setWaiting(false);
      return;
    }

    let cancelled = false;
    setWaiting(true);

    // Music's search endpoint is slower than a keystroke, so wait for a pause.
    const timer = setTimeout(() => {
      searchMusic(trimmed, filter)
        .then((found) => {
          if (cancelled) return;
          setShelves(found);
          setProblem(null);
        })
        .catch((error: unknown) => {
          if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setWaiting(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, filter]);

  const filterDropdown = (
    <List.Dropdown
      tooltip="Limit the search to one kind of result"
      value={filter}
      onChange={(value) => setFilter(value as SearchFilter)}
    >
      {SEARCH_FILTERS.map((option) => (
        <List.Dropdown.Item key={option.value} title={option.title} value={option.value} />
      ))}
    </List.Dropdown>
  );

  return (
    <List
      navigationTitle="YouTube Music"
      isLoading={waiting}
      isShowingDetail
      searchBarPlaceholder="Search YouTube Music, or pick a page"
      searchBarAccessory={filterDropdown}
      onSearchTextChange={setText}
    >
      {trimmed.length === 0 ? (
        <>
          <List.Section title="Player">
            <List.Item
              title="Now Playing"
              subtitle="Pause, skip and stop the shared mpv"
              icon={Icon.Headphones}
              detail={
                <PreviewDetail
                  markdown={"**Now Playing**\n\nControls the shared `mpv`; the list refreshes while it is open."}
                  load={() => previewNowPlaying(config)}
                />
              }
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Now Playing"
                    icon={Icon.Headphones}
                    shortcut="open"
                    target={<NowPlayingView config={config} />}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          {signedIn ? (
            <List.Section title="Library">
              <List.Item
                title="History"
                subtitle="Everything YouTube Music remembers you played"
                icon={Icon.Clock}
                detail={
                  <PreviewDetail
                    markdown={"**History**\n\nThe plays YouTube Music remembers, newest first."}
                    load={previewHistory}
                    cacheKey="history"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open History"
                      icon={Icon.Clock}
                      shortcut="open"
                      target={<HistoryView config={config} />}
                    />
                  </ActionPanel>
                }
              />
              <List.Item
                title="Liked songs"
                subtitle="The songs you have liked"
                icon={Icon.Heart}
                detail={
                  <PreviewDetail
                    markdown={"**Liked songs**\n\nEverything you gave a heart."}
                    load={previewLiked}
                    cacheKey="liked"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open Liked Songs"
                      icon={Icon.Heart}
                      shortcut="open"
                      target={<PlaylistView playlistId={LIKED_SONGS} title="Liked songs" config={config} />}
                    />
                  </ActionPanel>
                }
              />
              <List.Item
                title="Albums"
                subtitle="The albums saved to your library"
                icon={Icon.Music}
                detail={
                  <PreviewDetail
                    markdown={"**Albums**\n\nThe albums saved to your YouTube Music library."}
                    load={previewAlbums}
                    cacheKey="library:albums"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open Saved Albums"
                      icon={Icon.Music}
                      shortcut="open"
                      target={<LibraryView browseId={LIBRARY_ALBUMS} title="Albums" config={config} />}
                    />
                  </ActionPanel>
                }
              />
              <List.Item
                title="Artists"
                subtitle="The artists of the songs in your library"
                icon={Icon.PersonCircle}
                detail={
                  <PreviewDetail
                    markdown={"**Artists**\n\nThe artists behind the songs in your library."}
                    load={previewArtists}
                    cacheKey="library:artists"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open Library Artists"
                      icon={Icon.PersonCircle}
                      shortcut="open"
                      target={<LibraryView browseId={LIBRARY_ARTISTS} title="Artists" config={config} />}
                    />
                  </ActionPanel>
                }
              />
              <List.Item
                title="Playlists"
                subtitle="The playlists saved to your library"
                icon={Icon.BulletPoints}
                detail={
                  <PreviewDetail
                    markdown={"**Playlists**\n\nThe playlists saved to your YouTube Music library."}
                    load={previewPlaylists}
                    cacheKey="library:playlists"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open Saved Playlists"
                      icon={Icon.BulletPoints}
                      shortcut="open"
                      target={<LibraryView browseId={LIBRARY_PLAYLISTS} title="Playlists" config={config} />}
                    />
                  </ActionPanel>
                }
              />
              <List.Item
                title="Subscriptions"
                subtitle="The channels you follow"
                icon={Icon.Person}
                detail={
                  <PreviewDetail
                    markdown={"**Subscriptions**\n\nThe channels you follow on YouTube Music."}
                    load={previewSubscriptions}
                    cacheKey="library:subscriptions"
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Open Subscriptions"
                      icon={Icon.Person}
                      shortcut="open"
                      target={
                        <LibraryView browseId={LIBRARY_SUBSCRIPTIONS} title="Subscriptions" config={config} />
                      }
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          ) : (
            <List.Section title="Account">
              <List.Item
                title="Sign in to YouTube Music"
                subtitle={
                  session.problem ??
                  "Sign in in your browser, then read its cookies: your library, history and liked songs appear."
                }
                icon={Icon.Person}
                detail={
                  <List.Item.Detail
                    markdown={[
                      "**Sign in with cookies**",
                      "YouTube Music's private API has no OAuth application; Google's OAuth tokens only open the public YouTube Data API, which has no library, history or playback.",
                      "The extension reads the session from Firefox, Brave, Chrome, Chromium, Edge or Vivaldi, or from Sonora's stored session. Otherwise paste the `Cookie` header into the `Cookies` preference.",
                      "1. Open `music.youtube.com` in the browser and sign in.",
                      "2. Pick **Read Browser Cookies** here.",
                    ].join("\n\n")}
                  />
                }
                actions={
                  <ActionPanel>
                    <Action
                      title="Read Browser Cookies"
                      icon={Icon.ArrowClockwise}
                      shortcut="open"
                      onAction={refreshSession}
                    />
                    <Action
                      title="Open Browser Sign-In"
                      icon={Icon.Globe01}
                      shortcut={{ modifiers: ["ctrl"], key: "b" }}
                      onAction={() => void open("https://music.youtube.com").catch(() => undefined)}
                    />
                    <Action
                      title="Open Extension Preferences"
                      icon={Icon.Cog}
                      shortcut={{ modifiers: ["ctrl"], key: "," }}
                      onAction={() => void openExtensionPreferences()}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
          {history.length > 0 ? (
            <List.Section title="Recently played">
              {history.slice(0, 10).map((played) => (
                <PlayedRow key={played.videoId} played={played} config={config} />
              ))}
            </List.Section>
          ) : null}
          <List.Section title="Browse">
            {PAGES.map((page) => (
              <List.Item
                key={page.title}
                title={page.title}
                subtitle={page.subtitle}
                icon={page.icon}
                detail={
                  <PreviewDetail
                    markdown={`**${page.title}**\n\n${page.subtitle}`}
                    load={previewForPage(page.browseId)}
                    cacheKey={`browse:${page.browseId}`}
                  />
                }
                actions={
                  <ActionPanel>
                    <Action.Push
                      title={`Open ${page.title}`}
                      icon={page.icon}
                      shortcut="open"
                      target={<ShelvesView title={page.title} browseId={page.browseId} config={config} />}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        </>
      ) : trimmed.length < 2 ? (
        <List.EmptyView
          icon={Icon.Headphones}
          title="Keep typing"
          description="Two characters are enough to search YouTube Music."
        />
      ) : shelves.length > 0 ? (
        <ShelfSections shelves={shelves} config={config} />
      ) : waiting ? null : (
        <EmptyView problem={problem} what="search" />
      )}
    </List>
  );
}
