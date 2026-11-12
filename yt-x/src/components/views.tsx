import { Action, ActionPanel, Form, Icon, List, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { commentReplies, comments, moreComments, postComment } from "~/api/comments";
import { forgetPlaylist, forgetVideo, saveVideo, updateRecent } from "~/api/library";
import { download, downloadPlaylist, play, playPlaylist } from "~/api/player";
import { relatedVideos } from "~/api/related";
import { attempt, succeeded } from "~/api/toast";
import { fetchChannelInfo, fetchChannelUrl } from "~/api/ytdlp";
import { useListing, usePlaylistActions, type PlaylistActions } from "~/components/hooks";
import type { Config, Entry, Playlist } from "~/types";
import type { Comment, Thread } from "~/utils/comments";
import { messageOf } from "~/utils/errors";
import { searchUrl } from "~/utils/search";
import {
  channelSearchUrl,
  channelTabUrl,
  channelUrlOf,
  countLabel,
  formatCount,
  formatDuration,
  formatPublished,
  mixUrl,
  thumbnailUrl,
} from "~/utils/state";

export function iconFor(entry: Entry, fallback = Icon.Play) {
  const thumbnail = thumbnailUrl(entry);
  return thumbnail ? { source: thumbnail } : fallback;
}

/** Titles can carry markdown punctuation; the pane is markdown. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#]/g, "\\$&");
}

export type Field = { title: string; text: string };

/**
 * The side pane: the thumbnail and the title, with the facts yt-x keeps in its
 * preview below. The list on the left stays a list of titles.
 */
export function EntryDetail({ entry, fields = [] }: { entry: Entry; fields?: Field[] }) {
  const thumbnail = thumbnailUrl(entry);
  const description = entry.description?.trim();
  const markdown = [
    thumbnail ? `![](${thumbnail})` : "",
    `**${escapeMarkdown(entry.title)}**`,
    description ? escapeMarkdown(description) : "",
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

function videoFields(video: Entry): Field[] {
  const fields: Field[] = [];
  if (video.channel) fields.push({ title: "Channel", text: video.channel });

  if (video.liveStatus === "is_live") {
    fields.push({ title: "Status", text: "Live now" });
    const watching = formatCount(video.concurrentViewCount);
    if (watching) fields.push({ title: "Watching", text: watching });
  } else if (video.liveStatus === "is_upcoming") {
    fields.push({ title: "Status", text: "Upcoming" });
  } else if (video.liveStatus === "was_live") {
    fields.push({ title: "Status", text: "Was live" });
  }

  const views = formatCount(video.viewCount);
  if (views) fields.push({ title: "Views", text: views });

  const duration = video.liveStatus === "is_live" ? undefined : formatDuration(video.duration);
  if (duration) fields.push({ title: "Duration", text: duration });

  const published = formatPublished(video.publishedAt);
  if (published) fields.push({ title: "Published", text: published });

  return fields;
}

function VideoDetail({ video }: { video: Entry }) {
  return <EntryDetail entry={video} fields={videoFields(video)} />;
}

function channelFields(channel: Entry): Field[] {
  const subscribers = formatCount(channel.followerCount);
  return subscribers ? [{ title: "Subscribers", text: subscribers }] : [];
}

type VideoActionsProps = {
  video: Entry;
  config: Config;
  savedIds: ReadonlySet<string>;
  saved: boolean;
  onSavedChange: (id: string, saved: boolean) => void;
  playlist?: PlaylistActions;
};

function VideoActions({ video, config, savedIds, saved, onSavedChange, playlist }: VideoActionsProps) {
  function startPlay(url: string, listen: boolean): void {
    // the preference decides what plain Play does; the action below always does it
    if (!listen && config.upNext) {
      startUpNext();
      return;
    }
    void attempt("Could not start the player", async () => {
      await play(url, listen, config);
      updateRecent(video, config.configDir, config.noOfRecent);
    });
  }

  function startDownload(kind: "video" | "audio"): void {
    void attempt("Could not start the download", async () => {
      await download(video.url, kind, config);
      await succeeded(kind === "audio" ? "Audio download started" : "Video download started", config.downloadDir);
    });
  }

  function toggleSaved(): void {
    void attempt(saved ? "Could not remove the video" : "Could not save the video", async () => {
      if (saved) forgetVideo(video.id, config.configDir);
      else saveVideo(video, config.configDir);
      onSavedChange(video.id, !saved);
      await succeeded(saved ? "Removed from yt-x" : "Saved to yt-x", video.title);
    });
  }

  function startUpNext(): void {
    void attempt("Could not start the up next list", async () => {
      const related = await relatedVideos(video.id, config);
      await playPlaylist([video, ...related], config);
      updateRecent(video, config.configDir, config.noOfRecent);
    });
  }

  function startPlaylistPlay(listen: boolean): void {
    if (!playlist) return;
    void attempt("Could not start the player", async () => {
      await play(playlist.url, listen, config);
      updateRecent(video, config.configDir, config.noOfRecent);
    });
  }

  function startPlaylistDownload(kind: "video" | "audio"): void {
    if (!playlist) return;
    void attempt("Could not start the download", async () => {
      await downloadPlaylist(playlist.url, playlist.title, kind, config);
      await succeeded("Download started", `${config.downloadDir}/${kind}/${playlist.title}`);
    });
  }

  function togglePlaylistSaved(): void {
    if (!playlist) return;
    void attempt(playlist.saved ? "Could not remove the playlist" : "Could not save the playlist", async () => {
      if (playlist.saved) await playlist.forget();
      else await playlist.save();
      await succeeded(playlist.saved ? "Playlist removed" : "Playlist saved", playlist.title);
    });
  }

  return (
    <ActionPanel>
      <Action title="Play" icon={Icon.Play} shortcut="open" onAction={() => startPlay(video.url, false)} />
      <Action
        title="Play with Up Next"
        icon={Icon.Forward}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "u" }}
        onAction={startUpNext}
      />
      {config.player === "mpv" ? (
        <Action
          title="Listen"
          icon={Icon.Headphones}
          shortcut={{ modifiers: ["ctrl"], key: "l" }}
          onAction={() => startPlay(video.url, true)}
        />
      ) : null}
      <Action.Push
        title="Mix"
        icon={Icon.Shuffle}
        shortcut={{ modifiers: ["ctrl"], key: "m" }}
        target={
          <VideoList
            title={`Mix · ${video.title}`}
            target={mixUrl(video.id)}
            config={config}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
          />
        }
      />
      <Action.Push
        title="Related Videos"
        icon={Icon.BulletPoints}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
        target={
          <RelatedList
            video={video}
            config={config}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
          />
        }
      />
      <Action.Push
        title="Comments"
        icon={Icon.SpeechBubble}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "m" }}
        target={<CommentList video={video} config={config} />}
      />
      <ActionPanel.Submenu
        title="Download"
        icon={Icon.Download}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
      >
        <Action
          title="Download Video"
          icon={Icon.Video}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
          onAction={() => startDownload("video")}
        />
        <Action
          title="Download Audio"
          icon={Icon.Music}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "a" }}
          onAction={() => startDownload("audio")}
        />
      </ActionPanel.Submenu>
      <Action
        title={saved ? "Remove from yt-x" : "Save to yt-x"}
        icon={saved ? Icon.StarDisabled : Icon.Star}
        shortcut={saved ? "remove" : "save"}
        onAction={toggleSaved}
      />
      {playlist ? (
        <ActionPanel.Section title="Playlist">
          <Action
            title="Play All"
            icon={Icon.Play}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
            onAction={() => startPlaylistPlay(false)}
          />
          {config.player === "mpv" ? (
            <Action
              title="Listen to All"
              icon={Icon.Headphones}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "l" }}
              onAction={() => startPlaylistPlay(true)}
            />
          ) : null}
          <Action
            title="Download All"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "alt"], key: "d" }}
            onAction={() => startPlaylistDownload("video")}
          />
          <Action
            title="Download All Audio"
            icon={Icon.Music}
            shortcut={{ modifiers: ["ctrl", "alt"], key: "a" }}
            onAction={() => startPlaylistDownload("audio")}
          />
          <Action
            title={playlist.saved ? "Unsave Playlist" : "Save Playlist"}
            icon={playlist.saved ? Icon.StarDisabled : Icon.Star}
            shortcut={{ modifiers: ["ctrl", "shift"], key: playlist.saved ? "x" : "s" }}
            onAction={togglePlaylistSaved}
          />
        </ActionPanel.Section>
      ) : null}
      <Action.Push
        title="Go to Channel"
        icon={Icon.PersonLines}
        shortcut={{ modifiers: ["ctrl"], key: "g" }}
        target={
          <ChannelFromVideo video={video} config={config} savedIds={savedIds} onSavedChange={onSavedChange} />
        }
      />
      <Action.OpenInBrowser
        title="Open in Browser"
        url={video.url}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
      />
      <Action.CopyToClipboard title="Copy URL" content={video.url} shortcut="copy" />
    </ActionPanel>
  );
}

export function VideoRow({
  video,
  config,
  savedIds,
  saved,
  onSavedChange,
  playlist,
}: VideoActionsProps) {
  return (
    <List.Item
      title={video.title}
      icon={iconFor(video)}
      keywords={video.channel ? [video.channel] : []}
      detail={<VideoDetail video={video} />}
      actions={
        <VideoActions
          video={video}
          config={config}
          savedIds={savedIds}
          saved={saved}
          onSavedChange={onSavedChange}
          playlist={playlist}
        />
      }
    />
  );
}

type VideoListProps = {
  title: string;
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
  /** Local entries, used by the Recent and Saved views. */
  videos?: Entry[];
  /** A URL to list with yt-dlp, used by every YouTube view. */
  target?: string;
  /** A custom command's extra yt-dlp options. */
  extraOpts?: string[];
  /** The Saved view drops a row the moment it is unsaved. */
  removeOnUnsave?: boolean;
};

export function VideoList({
  title,
  config,
  savedIds,
  onSavedChange,
  videos,
  target,
  extraOpts,
  removeOnUnsave,
}: VideoListProps) {
  const listing = useListing(config, target, extraOpts);
  const playlistFor = usePlaylistActions(config);
  const [local, setLocal] = useState<Entry[]>(videos ?? []);
  const [saved, setSaved] = useState(() => new Set(savedIds));

  useEffect(() => {
    setLocal(videos ?? []);
  }, [videos]);

  function changeSaved(id: string, next: boolean): void {
    setSaved((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    if (!next && removeOnUnsave) setLocal((previous) => previous.filter((video) => video.id !== id));
    onSavedChange(id, next);
  }

  const rows = target ? listing.entries : local;
  const playlist = target ? playlistFor(listing.title ?? title, target) : undefined;

  return (
    <List
      navigationTitle={title}
      isLoading={listing.isLoading}
      isShowingDetail
      searchBarPlaceholder={`Filter ${title.toLowerCase()}`}
      pagination={target ? { hasMore: listing.hasMore, onLoadMore: listing.loadMore } : undefined}
    >
      {rows.map((video) => (
        <VideoRow
          key={video.id}
          video={video}
          config={config}
          savedIds={saved}
          saved={saved.has(video.id)}
          onSavedChange={changeSaved}
          playlist={playlist}
        />
      ))}
      {rows.length === 0 && !listing.isLoading ? (
        <List.EmptyView
          icon={listing.problem ? Icon.Warning : Icon.Video}
          title={listing.problem ? "Could not load the videos" : "No videos here"}
          description={listing.problem ?? "Try a different view, or search for something."}
        />
      ) : null}
    </List>
  );
}

/**
 * YouTube's "related" column, which yt-dlp cannot list: the rows come from the watch-next
 * endpoint and behave like any other listing once they arrive.
 */
function RelatedList({
  video,
  config,
  savedIds,
  onSavedChange,
}: Pick<VideoActionsProps, "config" | "savedIds" | "onSavedChange"> & { video: Entry }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const title = `Related · ${video.title}`;

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setProblem(null);

    relatedVideos(video.id, config)
      .then((found) => {
        if (!cancelled) setEntries(found);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(messageOf(error));
      });

    return () => {
      cancelled = true;
    };
  }, [video.id, config]);

  if (entries !== null) {
    return (
      <VideoList
        title={title}
        config={config}
        savedIds={savedIds}
        onSavedChange={onSavedChange}
        videos={entries}
      />
    );
  }

  return (
    <List navigationTitle={title} isLoading={problem === null} isShowingDetail>
      {problem ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not load the related videos"
          description={problem}
        />
      ) : null}
    </List>
  );
}

type ChannelRowProps = {
  channel: Entry;
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
};

export function ChannelRow({ channel, config, savedIds, onSavedChange }: ChannelRowProps) {
  return (
    <List.Item
      title={channel.title}
      icon={iconFor(channel, Icon.Person)}
      detail={<EntryDetail entry={channel} fields={channelFields(channel)} />}
      actions={
        <ActionPanel>
          <Action.Push
            title="Videos"
            icon={Icon.Play}
            shortcut="open"
            target={
              <VideoList
                title={`${channel.title} · Videos`}
                target={channelTabUrl(channel.url, "videos")}
                config={config}
                savedIds={savedIds}
                onSavedChange={onSavedChange}
              />
            }
          />
          <ActionPanel.Submenu
            title="Open Tab"
            icon={Icon.BulletPoints}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
          >
            <Action.Push
              title="Featured"
              icon={Icon.Star}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
              target={
                <PlaylistResults
                  title={`${channel.title} · Featured`}
                  target={channelTabUrl(channel.url, "featured")}
                  config={config}
                  savedIds={savedIds}
                  onSavedChange={onSavedChange}
                />
              }
            />
            <Action.Push
              title="Playlists"
              icon={Icon.BulletPoints}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
              target={
                <PlaylistResults
                  title={`${channel.title} · Playlists`}
                  target={channelTabUrl(channel.url, "playlists")}
                  config={config}
                  savedIds={savedIds}
                  onSavedChange={onSavedChange}
                />
              }
            />
            <Action.Push
              title="Shorts"
              icon={Icon.FilmStrip}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }}
              target={
                <VideoList
                  title={`${channel.title} · Shorts`}
                  target={channelTabUrl(channel.url, "shorts")}
                  config={config}
                  savedIds={savedIds}
                  onSavedChange={onSavedChange}
                />
              }
            />
            <Action.Push
              title="Streams"
              icon={Icon.Video}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
              target={
                <VideoList
                  title={`${channel.title} · Streams`}
                  target={channelTabUrl(channel.url, "streams")}
                  config={config}
                  savedIds={savedIds}
                  onSavedChange={onSavedChange}
                />
              }
            />
            <Action.Push
              title="Podcasts"
              icon={Icon.Microphone}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
              target={
                <VideoList
                  title={`${channel.title} · Podcasts`}
                  target={channelTabUrl(channel.url, "podcasts")}
                  config={config}
                  savedIds={savedIds}
                  onSavedChange={onSavedChange}
                />
              }
            />
          </ActionPanel.Submenu>
          <Action.Push
            title="Search This Channel"
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
            target={
              <SearchView
                title={`${channel.title} · Search`}
                placeholder={`Search ${channel.title}`}
                kind="videos"
                channelUrl={channel.url}
                config={config}
                savedIds={savedIds}
                onSavedChange={onSavedChange}
              />
            }
          />
          <Action.OpenInBrowser
            title="Open in Browser"
            url={channel.url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Channel URL" content={channel.url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function ChannelList({
  title,
  channels,
  config,
  savedIds,
  onSavedChange,
}: {
  title: string;
  channels: Entry[];
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
}) {
  return (
    <List navigationTitle={title} isShowingDetail searchBarPlaceholder={`Filter ${title.toLowerCase()}`}>
      <List.Section title={title} subtitle={countLabel(channels.length, "channel")}>
        {channels.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            config={config}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
          />
        ))}
      </List.Section>
      {channels.length === 0 ? (
        <List.EmptyView
          icon={Icon.PersonLines}
          title="No channels here"
          description="Sync your subscriptions from yt-x, or explore channels first."
        />
      ) : null}
    </List>
  );
}

/**
 * yt-x's "Go To Channel": the channel page itself, with the avatar, subscriber
 * count and description yt-dlp keeps at the top of the channel listing.
 */
export function ChannelFromVideo({
  video,
  config,
  savedIds,
  onSavedChange,
}: {
  video: Entry;
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
}) {
  const known = channelUrlOf(video);
  const [channel, setChannel] = useState<Entry | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const url = known ?? (await fetchChannelUrl(video.url, config));
        const info = await fetchChannelInfo(url, config);
        if (cancelled) return;
        // A listing that lost its header still names the channel on the video.
        setChannel(info ?? { id: video.channelId ?? url, title: video.channel ?? url, url });
      } catch (error) {
        if (cancelled) return;
        setProblem(messageOf(error));
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [config, known, video.channel, video.channelId, video.url]);

  if (!channel) {
    return (
      <List navigationTitle="Channel" isLoading={!problem} isShowingDetail>
        <List.EmptyView
          icon={problem ? Icon.Warning : Icon.Person}
          title={problem ? "Could not open the channel" : "Opening the channel"}
          description={problem ?? video.title}
        />
      </List>
    );
  }

  return (
    <List navigationTitle={channel.title} isShowingDetail searchBarPlaceholder={channel.title}>
      <ChannelRow channel={channel} config={config} savedIds={savedIds} onSavedChange={onSavedChange} />
    </List>
  );
}

export function PlaylistRow({
  playlist,
  config,
  savedIds,
  onSavedChange,
  playlistFor,
}: {
  playlist: Entry;
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
  playlistFor: ReturnType<typeof usePlaylistActions>;
}) {
  const saved = playlistFor(playlist.title, playlist.url);

  return (
    <List.Item
      title={playlist.title}
      icon={iconFor(playlist, Icon.BulletPoints)}
      detail={<EntryDetail entry={playlist} />}
      actions={
        <ActionPanel>
          <Action.Push
            title="Open Playlist"
            icon={Icon.Play}
            shortcut="open"
            target={
              <VideoList
                title={playlist.title}
                target={playlist.url}
                config={config}
                savedIds={savedIds}
                onSavedChange={onSavedChange}
              />
            }
          />
          <Action
            title={saved.saved ? "Unsave Playlist" : "Save Playlist"}
            icon={saved.saved ? Icon.StarDisabled : Icon.Star}
            shortcut={saved.saved ? "remove" : "save"}
            onAction={() =>
              void attempt(
                saved.saved ? "Could not remove the playlist" : "Could not save the playlist",
                async () => {
                  if (saved.saved) await saved.forget();
                  else await saved.save();
                  await succeeded(saved.saved ? "Playlist removed" : "Playlist saved", playlist.title);
                },
              )
            }
          />
          <Action.OpenInBrowser
            title="Open in Browser"
            url={playlist.url}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Playlist URL" content={playlist.url} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function PlaylistResults({
  title,
  target,
  config,
  savedIds,
  onSavedChange,
}: {
  title: string;
  target: string;
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
}) {
  const listing = useListing(config, target);
  const playlistFor = usePlaylistActions(config);

  return (
    <List
      navigationTitle={title}
      isLoading={listing.isLoading}
      isShowingDetail
      searchBarPlaceholder={`Filter ${title.toLowerCase()}`}
      pagination={{ hasMore: listing.hasMore, onLoadMore: listing.loadMore }}
    >
      {listing.entries.map((playlist) => (
        <PlaylistRow
          key={playlist.id}
          playlist={playlist}
          config={config}
          savedIds={savedIds}
          onSavedChange={onSavedChange}
          playlistFor={playlistFor}
        />
      ))}
      {listing.entries.length === 0 && !listing.isLoading ? (
        <List.EmptyView
          icon={listing.problem ? Icon.Warning : Icon.BulletPoints}
          title={listing.problem ? "Could not load the playlists" : "No playlists here"}
          description={listing.problem ?? "Try a different view."}
        />
      ) : null}
    </List>
  );
}

export function CustomPlaylistList({
  playlists,
  config,
  savedIds,
  onSavedChange,
}: {
  playlists: Playlist[];
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
}) {
  const [rows, setRows] = useState(playlists);

  return (
    <List navigationTitle="My Playlists" searchBarPlaceholder="Filter my playlists">
      <List.Section title="My Playlists" subtitle={countLabel(rows.length, "playlist")}>
        {rows.map((playlist) => (
          <List.Item
            key={`${playlist.name}-${playlist.url}`}
            title={playlist.name}
            icon={Icon.BulletPoints}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open Playlist"
                  icon={Icon.Play}
                  shortcut="open"
                  target={
                    <VideoList
                      title={playlist.name}
                      target={playlist.url}
                      config={config}
                      savedIds={savedIds}
                      onSavedChange={onSavedChange}
                    />
                  }
                />
                <Action
                  title="Unsave Playlist"
                  icon={Icon.StarDisabled}
                  shortcut="remove"
                  onAction={() =>
                    void attempt("Could not remove the playlist", async () => {
                      forgetPlaylist(playlist.url, config.configDir);
                      setRows((previous) => previous.filter((row) => row.url !== playlist.url));
                      await succeeded("Playlist removed", playlist.name);
                    })
                  }
                />
                <Action.OpenInBrowser
                  title="Open in Browser"
                  url={playlist.url}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
                />
                <Action.CopyToClipboard title="Copy Playlist URL" content={playlist.url} shortcut="copy" />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {rows.length === 0 ? (
        <List.EmptyView
          icon={Icon.BulletPoints}
          title="No custom playlists"
          description="Use Save Playlist on any listing and it appears here."
        />
      ) : null}
    </List>
  );
}

type SearchViewProps = {
  title: string;
  placeholder: string;
  kind: "videos" | "channels" | "playlists";
  config: Config;
  savedIds: ReadonlySet<string>;
  onSavedChange: (id: string, saved: boolean) => void;
  /** A YouTube filter id, as yt-x uses for its explore menus. */
  sp?: string;
  /** Searching inside one channel instead of all of YouTube. */
  channelUrl?: string;
};

/** yt-x's explore and in-channel searches: type a term, get a listing. */
export function SearchView({
  title,
  placeholder,
  kind,
  config,
  savedIds,
  onSavedChange,
  sp,
  channelUrl,
}: SearchViewProps) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);
  const [saved, setSaved] = useState(() => new Set(savedIds));
  const trimmed = text.trim();
  const listing = useListing(config, target);
  const playlistFor = usePlaylistActions(config);

  useEffect(() => {
    if (trimmed.length < 2) {
      setTarget(undefined);
      setWaiting(false);
      return;
    }

    setWaiting(true);
    const timer = setTimeout(() => {
      setTarget(
        channelUrl
          ? channelSearchUrl(channelUrl, trimmed)
          : searchUrl(trimmed, sp ?? "EgIQAQ%253D%253D"),
      );
      setWaiting(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [channelUrl, sp, trimmed]);

  function changeSaved(id: string, next: boolean): void {
    setSaved((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    onSavedChange(id, next);
  }

  const playlist = target ? playlistFor(listing.title ?? title, target) : undefined;

  return (
    <List
      navigationTitle={title}
      searchBarPlaceholder={placeholder}
      isLoading={listing.isLoading || waiting}
      isShowingDetail
      onSearchTextChange={setText}
      pagination={{ hasMore: listing.hasMore, onLoadMore: listing.loadMore }}
    >
      {listing.entries.map((entry) => {
        if (kind === "channels") {
          return (
            <ChannelRow
              key={entry.id}
              channel={entry}
              config={config}
              savedIds={saved}
              onSavedChange={changeSaved}
            />
          );
        }
        if (kind === "playlists") {
          return (
            <PlaylistRow
              key={entry.id}
              playlist={entry}
              config={config}
              savedIds={saved}
              onSavedChange={changeSaved}
              playlistFor={playlistFor}
            />
          );
        }
        return (
          <VideoRow
            key={entry.id}
            video={entry}
            config={config}
            savedIds={saved}
            saved={saved.has(entry.id)}
            onSavedChange={changeSaved}
            playlist={playlist}
          />
        );
      })}
      {trimmed.length < 2 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Keep typing"
          description="Two characters are enough to search."
        />
      ) : listing.entries.length === 0 && !listing.isLoading && !waiting ? (
        <List.EmptyView
          icon={listing.problem ? Icon.Warning : Icon.MagnifyingGlass}
          title={listing.problem ? "Search failed" : "Nothing found"}
          description={listing.problem ?? "Try different words."}
        />
      ) : null}
    </List>
  );
}

/** A comment's own page count: YouTube answers about twenty threads, so the fill loops. */
const COMMENT_PAGE = 25;

function metaOf(comment: Comment): string {
  const likes = comment.likes === undefined || comment.likes === "0" ? undefined : `${comment.likes} likes`;
  return [comment.published, likes].filter((part) => part !== undefined).join(" · ");
}

function quoted(comment: Comment): string {
  const meta = metaOf(comment);
  const lines = [`**${escapeMarkdown(comment.author)}**${meta === "" ? "" : ` · ${meta}`}`, "", ...escapeMarkdown(comment.text).split("\n")];
  return lines.map((line) => (line === "" ? ">" : `> ${line}`)).join("\n");
}

/** The detail pane holds the whole comment, and the thread behind it once that is fetched. */
function CommentDetail({ videoId, thread, config }: { videoId: string; thread: Thread; config: Config }) {
  const token = thread.repliesToken;
  const [replies, setReplies] = useState<Comment[] | null>(token === undefined ? [] : null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (token === undefined) {
      setReplies([]);
      return;
    }
    let cancelled = false;
    setReplies(null);
    setProblem(null);

    commentReplies(videoId, token, config)
      .then((page) => {
        if (!cancelled) setReplies(page.replies);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(messageOf(error));
      });

    return () => {
      cancelled = true;
    };
  }, [videoId, token, config]);

  const { comment } = thread;
  const meta = metaOf(comment);
  const parts = [
    `**${escapeMarkdown(comment.author)}**`,
    meta,
    "",
    escapeMarkdown(comment.text),
  ];

  if (token !== undefined) {
    parts.push("\n---\n");
    if (problem !== null) parts.push(`_Could not load the replies — ${escapeMarkdown(problem)}_`);
    else if (replies === null) parts.push("_Loading replies…_");
    else if (replies.length === 0) parts.push("_No replies._");
    else parts.push(replies.map(quoted).join("\n\n"));
  }

  return <List.Item.Detail markdown={parts.filter((part) => part !== "").join("\n\n")} />;
}

function CommentRow({
  video,
  thread,
  config,
  createToken,
  onPosted,
}: {
  video: Entry;
  thread: Thread;
  config: Config;
  createToken?: string;
  onPosted: () => void;
}) {
  const { comment } = thread;
  const snippet = comment.text.replace(/\s+/g, " ").slice(0, 120);

  return (
    <List.Item
      title={comment.author}
      subtitle={snippet}
      icon={comment.avatar === undefined ? Icon.Person : { source: comment.avatar }}
      detail={<CommentDetail videoId={video.id} thread={thread} config={config} />}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open Comment"
            url={`https://www.youtube.com/watch?v=${video.id}&lc=${encodeURIComponent(comment.id)}`}
            shortcut="open"
          />
          <Action.CopyToClipboard title="Copy Comment" content={comment.text} shortcut="copy" />
          {comment.channelId === undefined ? null : (
            <Action.OpenInBrowser
              title="Go to Channel"
              url={`https://www.youtube.com/channel/${comment.channelId}`}
              shortcut={{ modifiers: ["ctrl"], key: "o" }}
            />
          )}
          <Action.CopyToClipboard title="Copy Author" content={comment.author} />
          {createToken === undefined ? null : (
            <Action.Push
              title="Write a Comment"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["ctrl"], key: "n" }}
              target={
                <CommentForm video={video} createToken={createToken} config={config} onPosted={onPosted} />
              }
            />
          )}
        </ActionPanel>
      }
    />
  );
}

/** The comments section as two panes: threads on the left, one thread in full on the right. */
function CommentList({ video, config }: { video: Entry; config: Config }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [continuation, setContinuation] = useState<string | undefined>(undefined);
  const [createToken, setCreateToken] = useState<string | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState(COMMENT_PAGE);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fill(buffer: Thread[], token: string | undefined, target: number) {
    let all = buffer;
    let next = token;
    while (all.length < target && next !== undefined) {
      const page = await moreComments(video.id, next, config);
      all = [...all, ...page.threads];
      next = page.continuation;
    }
    return { threads: all, continuation: next };
  }

  useEffect(() => {
    let cancelled = false;
    setThreads(null);
    setProblem(null);
    setShown(COMMENT_PAGE);

    comments(video.id, config)
      .then((first) => {
        if (!cancelled) setCreateToken(first.createToken);
        return fill(first.threads, first.continuation, COMMENT_PAGE);
      })
      .then((filled) => {
        if (cancelled) return;
        setThreads(filled.threads);
        setContinuation(filled.continuation);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(messageOf(error));
      });

    return () => {
      cancelled = true;
    };
  }, [video.id, config, reload]);

  const loadMore = async (): Promise<void> => {
    if (threads === null || loading) return;
    setLoading(true);
    try {
      const filled = await fill(threads, continuation, shown + COMMENT_PAGE);
      setThreads(filled.threads);
      setContinuation(filled.continuation);
      setShown(Math.min(filled.threads.length, shown + COMMENT_PAGE));
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setLoading(false);
    }
  };

  const more = threads !== null && (threads.length > shown || continuation !== undefined);

  return (
    <List
      navigationTitle={`Comments · ${video.title}`}
      isLoading={(threads === null && problem === null) || loading}
      isShowingDetail
      searchBarPlaceholder="Filter these comments"
      pagination={{ hasMore: more, onLoadMore: () => void loadMore() }}
    >
      {problem === null ? null : (
        <List.EmptyView icon={Icon.Warning} title="Could not load the comments" description={problem} />
      )}
      {threads !== null && threads.length === 0 && problem === null ? (
        <List.EmptyView icon={Icon.SpeechBubble} title="No comments" description="This video has comments turned off." />
      ) : null}
      {(threads ?? []).slice(0, shown).map((thread) => (
        <CommentRow
          key={thread.comment.id}
          video={video}
          thread={thread}
          config={config}
          createToken={createToken}
          onPosted={() => setReload((count) => count + 1)}
        />
      ))}
    </List>
  );
}

/** YouTube only hands the posting token to a signed-in comment box, so the action hides without one. */
function CommentForm({
  video,
  createToken,
  config,
  onPosted,
}: {
  video: Entry;
  createToken: string;
  config: Config;
  onPosted: () => void;
}) {
  const { pop } = useNavigation();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  async function submit(): Promise<void> {
    const body = text.trim();
    if (body === "" || posting) return;

    setPosting(true);
    try {
      await attempt("Could not post the comment", async () => {
        await postComment(video.id, body, createToken, config);
        await succeeded("Comment posted", video.title);
        onPosted();
        pop();
      });
    } finally {
      setPosting(false);
    }
  }

  return (
    <Form
      navigationTitle={`Comment · ${video.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={posting ? "Posting…" : "Post Comment"} icon={Icon.SpeechBubble} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="text"
        title="Comment"
        placeholder="Add a comment…"
        value={text}
        onChange={setText}
        autoFocus
        info="Published as the account signed in to the browser, on the public video page."
      />
    </Form>
  );
}
