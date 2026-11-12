import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { downloadDiscography } from "~/api/downloads";
import { artist as fetchArtist } from "~/api/monochrome";
import { playAll, shuffleAll } from "~/api/playback";
import type { MusicConfig } from "~/api/player";
import { AlbumView } from "~/components/album";
import { ReleaseRow, TrackRow } from "~/components/rows";
import { artistUrl, escapeMarkdown, type Artist } from "~/utils/monochrome";

export function ArtistView({ artistId, config }: { artistId: string; config: MusicConfig }) {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setArtist(null);
    setProblem(null);

    fetchArtist(artistId)
      .then((found) => {
        if (!cancelled) setArtist(found);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [artistId]);

  const albumTarget = (id: string) => <AlbumView releaseId={id} config={config} />;
  const artistTarget = (id: string) => <ArtistView artistId={id} config={config} />;

  const playable = artist ? artist.popular : [];

  return (
    <List
      navigationTitle={artist?.name ?? "Artist"}
      isLoading={artist === null && problem === null}
      isShowingDetail
      searchBarPlaceholder="Filter this artist"
    >
      {problem ? <List.EmptyView icon={Icon.Warning} title="Could not load the artist" description={problem} /> : null}

      {artist ? (
        <List.Section title={artist.name}>
          <List.Item
            title={artist.name}
            subtitle={`${artist.popular.length} popular tracks · ${artist.albums.length} albums · ${artist.singles.length} EPs and singles`}
            icon={artist.avatar ? { source: artist.avatar } : Icon.Person}
            detail={
              <List.Item.Detail
                markdown={[
                  artist.avatar ? `![](${artist.avatar})` : "",
                  `**${escapeMarkdown(artist.name)}**`,
                  artist.bio ? escapeMarkdown(artist.bio) : "",
                ]
                  .filter((part) => part !== "")
                  .join("\n\n")}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Play Popular Tracks"
                  icon={Icon.Play}
                  shortcut="open"
                  onAction={() => playAll(playable, config)}
                />
                <Action
                  title="Shuffle Popular Tracks"
                  icon={Icon.Shuffle}
                  shortcut={{ modifiers: ["ctrl"], key: "s" }}
                  onAction={() => shuffleAll(playable, config)}
                />
                <Action
                  title="Download Discography"
                  icon={Icon.Download}
                  shortcut={{ modifiers: ["ctrl", "alt"], key: "d" }}
                  onAction={() => downloadDiscography(artist.id, config)}
                />
                <Action.OpenInBrowser
                  title="Open in Monochrome"
                  url={artistUrl(artist.id)}
                  shortcut={{ modifiers: ["ctrl"], key: "o" }}
                />
                {artist.externalLink ? (
                  <Action.OpenInBrowser
                    title="Open the Artist's Link"
                    url={artist.externalLink}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
                  />
                ) : null}
                <Action.CopyToClipboard title="Copy Link" content={artistUrl(artist.id)} shortcut="copy" />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {artist && artist.popular.length > 0 ? (
        <List.Section title="Popular">
          {artist.popular.map((track) => (
            <TrackRow key={track.id} track={track} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}

      {artist && artist.albums.length > 0 ? (
        <List.Section title="Albums">
          {artist.albums.map((album) => (
            <ReleaseRow key={album.id} release={album} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}

      {artist && artist.singles.length > 0 ? (
        <List.Section title="EPs and Singles">
          {artist.singles.map((single) => (
            <ReleaseRow key={single.id} release={single} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}

      {artist && artist.compilations.length > 0 ? (
        <List.Section title="Compilations">
          {artist.compilations.map((release) => (
            <ReleaseRow key={release.id} release={release} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
