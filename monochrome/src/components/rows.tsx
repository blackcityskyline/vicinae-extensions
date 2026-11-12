import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import type { ReactNode } from "react";

import { downloadRelease, downloadTrack } from "~/api/downloads";
import {
  playAll,
  queueAlbum,
  queueAudio,
  startAlbum,
  startAudio,
  startNext,
  startTrack,
} from "~/api/playback";
import type { MusicConfig } from "~/api/player";
import {
  albumUrl,
  artistUrl,
  artistsOf,
  clock,
  escapeMarkdown,
  streamUrl,
  webUrl,
  type Artist,
  type ArtistSummary,
  type ReleaseSummary,
  type Track,
} from "~/utils/monochrome";
import { podcastUrl, type Episode, type Podcast } from "~/utils/podcasts";

/**
 * The views push each other, so a row takes a factory instead of importing the views and
 * closing an import cycle.
 */
export type Target = (id: string) => ReactNode;

function facts(entries: Array<[string, string | undefined]>): Array<[string, string]> {
  return entries.flatMap(([title, text]) => (text === undefined ? [] : [[title, text] as [string, string]]));
}

function TrackDetail({ track }: { track: Track }) {
  return (
    <List.Item.Detail
      markdown={[
        track.artwork ? `![](${track.artwork})` : "",
        `**${escapeMarkdown(track.title)}**`,
        escapeMarkdown(artistsOf(track.artists)),
      ]
        .filter((part) => part !== "")
        .join("\n\n")}
      metadata={
        <List.Item.Detail.Metadata>
          {facts([
            ["Duration", clock(track.duration)],
            ["Format", "FLAC"],
          ]).map(([title, text]) => (
            <List.Item.Detail.Metadata.Label key={title} title={title} text={text} />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export function TrackRow({
  track,
  config,
  album,
  artist,
}: {
  track: Track;
  config: MusicConfig;
  album?: Target;
  artist?: Target;
}) {
  return (
    <List.Item
      title={track.title}
      subtitle={artistsOf(track.artists)}
      icon={track.artwork ? { source: track.artwork } : Icon.Music}
      keywords={track.artists}
      detail={<TrackDetail track={track} />}
      actions={
        <ActionPanel>
          <Action title="Play" icon={Icon.Play} shortcut="open" onAction={() => startTrack(track, config)} />
          <Action
            title="Play Next"
            icon={Icon.Forward}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
            onAction={() => startNext(track, config, true)}
          />
          <Action
            title="Add to Queue"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["ctrl"], key: "q" }}
            onAction={() => startNext(track, config, false)}
          />
          {album && track.releaseId ? (
            <Action.Push
              title="Go to Album"
              icon={Icon.BulletPoints}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "a" }}
              target={album(track.releaseId)}
            />
          ) : null}
          {artist && track.artistId ? (
            <Action.Push
              title="Go to Artist"
              icon={Icon.Person}
              shortcut={{ modifiers: ["ctrl"], key: "." }}
              target={artist(track.artistId)}
            />
          ) : null}
          <Action.OpenInBrowser
            title="Open in Monochrome"
            url={webUrl(track.id)}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Link" content={webUrl(track.id)} shortcut="copy" />
          <Action.CopyToClipboard
            title="Copy Stream URL"
            content={streamUrl(track.id)}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
          />
          <Action
            title="Download"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "alt"], key: "d" }}
            onAction={() => downloadTrack(track, config)}
          />
        </ActionPanel>
      }
    />
  );
}

export function ReleaseRow({
  release,
  config,
  album,
  artist,
}: {
  release: ReleaseSummary;
  config: MusicConfig;
  album?: Target;
  artist?: Target;
}) {
  const released = release.releaseDate?.slice(0, 10);
  const rows = [
    ["Type", release.releaseType],
    ["Released", released],
    ["Tracks", release.trackCount === undefined ? undefined : String(release.trackCount)],
  ] as Array<[string, string | undefined]>;

  return (
    <List.Item
      title={release.title}
      subtitle={[artistsOf(release.artists), release.releaseType, released]
        .filter((part) => part !== undefined && part !== "")
        .join(" · ")}
      icon={release.artwork ? { source: release.artwork } : Icon.BulletPoints}
      keywords={release.artists}
      detail={
        <List.Item.Detail
          markdown={[
            release.artwork ? `![](${release.artwork})` : "",
            `**${escapeMarkdown(release.title)}**`,
            escapeMarkdown(artistsOf(release.artists)),
          ]
            .filter((part) => part !== "")
            .join("\n\n")}
          metadata={
            <List.Item.Detail.Metadata>
              {facts(rows).map(([title, text]) => (
                <List.Item.Detail.Metadata.Label key={title} title={title} text={text} />
              ))}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          {album ? (
            <Action.Push
              title="Open Album"
              icon={Icon.BulletPoints}
              shortcut="open"
              target={album(release.id)}
            />
          ) : null}
          <Action
            title="Play Album"
            icon={Icon.Play}
            shortcut={{ modifiers: ["ctrl"], key: "p" }}
            onAction={() => startAlbum(release.id, config)}
          />
          <Action
            title="Add Album to Queue"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["ctrl"], key: "q" }}
            onAction={() => queueAlbum(release.id, config, false)}
          />
          <Action
            title="Download Album"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "alt"], key: "d" }}
            onAction={() => downloadRelease(release.id, config)}
          />
          {artist && release.artistId ? (
            <Action.Push
              title="Go to Artist"
              icon={Icon.Person}
              shortcut={{ modifiers: ["ctrl"], key: "." }}
              target={artist(release.artistId)}
            />
          ) : null}
          <Action.OpenInBrowser
            title="Open in Monochrome"
            url={albumUrl(release.id)}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Link" content={albumUrl(release.id)} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function ArtistRow({
  artist,
  config,
  view,
}: {
  artist: ArtistSummary | Artist;
  config: MusicConfig;
  view?: Target;
}) {
  const popular = "popular" in artist ? artist.popular : [];
  const albumCount = "albums" in artist ? artist.albums.length + artist.singles.length : 0;

  return (
    <List.Item
      title={artist.name}
      subtitle={
        albumCount > 0 ? `${albumCount} releases · ${popular.length} popular tracks` : "Artist"
      }
      icon={artist.avatar ? { source: artist.avatar } : Icon.Person}
      actions={
        <ActionPanel>
          {view ? (
            <Action.Push title="Open Artist" icon={Icon.Person} shortcut="open" target={view(artist.id)} />
          ) : null}
          {popular.length > 0 ? (
            <Action
              title="Play Popular Tracks"
              icon={Icon.Play}
              shortcut={{ modifiers: ["ctrl"], key: "p" }}
              onAction={() => playAll(popular, config)}
            />
          ) : null}
          <Action.OpenInBrowser
            title="Open in Monochrome"
            url={artistUrl(artist.id)}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Link" content={artistUrl(artist.id)} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function PodcastRow({
  podcast,
  view,
}: {
  podcast: Podcast;
  view?: Target;
}) {
  return (
    <List.Item
      title={podcast.title}
      subtitle={[podcast.author, podcast.episodeCount === undefined ? undefined : `${podcast.episodeCount} episodes`]
        .filter((part) => part !== undefined && part !== "")
        .join(" · ")}
      icon={podcast.artwork ? { source: podcast.artwork } : Icon.Microphone}
      actions={
        <ActionPanel>
          {view ? (
            <Action.Push title="Open Podcast" icon={Icon.Microphone} shortcut="open" target={view(String(podcast.id))} />
          ) : null}
          <Action.OpenInBrowser
            title="Open in Monochrome"
            url={podcastUrl(podcast.id)}
            shortcut={{ modifiers: ["ctrl"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy Link" content={podcastUrl(podcast.id)} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}

export function EpisodeRow({ episode, config }: { episode: Episode; config: MusicConfig }) {
  return (
    <List.Item
      title={episode.title}
      subtitle={[episode.published, clock(episode.duration)]
        .filter((part) => part !== undefined && part !== "")
        .join(" · ")}
      icon={episode.artwork ? { source: episode.artwork } : Icon.Microphone}
      actions={
        <ActionPanel>
          <Action
            title="Play Episode"
            icon={Icon.Play}
            shortcut="open"
            onAction={() => startAudio(episode.audio, config)}
          />
          <Action
            title="Play Next"
            icon={Icon.Forward}
            shortcut={{ modifiers: ["ctrl"], key: "n" }}
            onAction={() => queueAudio(episode.audio, config, true)}
          />
          <Action
            title="Add to Queue"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["ctrl"], key: "q" }}
            onAction={() => queueAudio(episode.audio, config, false)}
          />
          {episode.podcastId === undefined ? null : (
            <Action.OpenInBrowser
              title="Open in Monochrome"
              url={podcastUrl(episode.podcastId)}
              shortcut={{ modifiers: ["ctrl"], key: "o" }}
            />
          )}
          <Action.OpenInBrowser title="Open the Audio File" url={episode.audio} />
          <Action.CopyToClipboard title="Copy Audio URL" content={episode.audio} shortcut="copy" />
        </ActionPanel>
      }
    />
  );
}
