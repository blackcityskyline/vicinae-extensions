import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { artist as fetchArtist, releaseTracks } from "~/api/monochrome";
import { downloadRelease } from "~/api/downloads";
import { queueAlbum, startAlbum } from "~/api/playback";
import type { MusicConfig } from "~/api/player";
import { ReleaseRow, TrackRow } from "~/components/rows";
import { ArtistView } from "~/components/artist";
import { albumUrl, artistsOf, escapeMarkdown, type Release, type ReleaseSummary } from "~/utils/monochrome";

type Siblings = {
  artistId?: string;
  artistName?: string;
  albums: ReleaseSummary[];
  singles: ReleaseSummary[];
};

export function AlbumView({ releaseId, config }: { releaseId: string; config: MusicConfig }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [siblings, setSiblings] = useState<Siblings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRelease(null);
    setSiblings(null);
    setProblem(null);

    void (async () => {
      try {
        const found = await releaseTracks(releaseId);
        if (cancelled) return;
        setRelease(found);

        const artistId = found.tracks.find((track) => track.artistId)?.artistId;
        if (!artistId) return;

        const page = await fetchArtist(artistId);
        if (cancelled) return;
        setSiblings({
          artistId: page.id,
          artistName: page.name,
          albums: page.albums.filter((album) => album.id !== releaseId),
          singles: page.singles.filter((single) => single.id !== releaseId),
        });
      } catch (error) {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  const artistTarget = (id: string) => <ArtistView artistId={id} config={config} />;
  const albumTarget = (id: string) => <AlbumView releaseId={id} config={config} />;

  return (
    <List
      navigationTitle={release?.title ?? "Album"}
      isLoading={release === null && problem === null}
      isShowingDetail
      searchBarPlaceholder="Filter this album"
    >
      {problem ? <List.EmptyView icon={Icon.Warning} title="Could not load the album" description={problem} /> : null}

      {release ? (
        <List.Section title={release.title}>
          <List.Item
            title="Play Album"
            subtitle={`${release.tracks.length} tracks · ${artistsOf(release.tracks[0]?.artists ?? [])}`}
            icon={release.artwork ? { source: release.artwork } : Icon.Play}
            detail={
              <List.Item.Detail
                markdown={[
                  release.artwork ? `![](${release.artwork})` : "",
                  `**${escapeMarkdown(release.title)}**`,
                  escapeMarkdown(artistsOf(release.tracks[0]?.artists ?? [])),
                ]
                  .filter((part) => part !== "")
                  .join("\n\n")}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Play Album"
                  icon={Icon.Play}
                  shortcut="open"
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
                {siblings?.artistId ? (
                  <Action.Push
                    title="Go to Artist"
                    icon={Icon.Person}
                    shortcut={{ modifiers: ["ctrl"], key: "." }}
                    target={artistTarget(siblings.artistId)}
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
        </List.Section>
      ) : null}

      {release && release.tracks.length > 0 ? (
        <List.Section title="Tracks">
          {release.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={{ ...track, releaseId: track.releaseId ?? release.id }}
              config={config}
              album={albumTarget}
              artist={artistTarget}
            />
          ))}
        </List.Section>
      ) : null}

      {siblings && siblings.albums.length > 0 ? (
        <List.Section title={`More albums from ${siblings.artistName ?? "the artist"}`}>
          {siblings.albums.map((album) => (
            <ReleaseRow key={album.id} release={album} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}

      {siblings && siblings.singles.length > 0 ? (
        <List.Section title={`EPs and Singles from ${siblings.artistName ?? "the artist"}`}>
          {siblings.singles.map((single) => (
            <ReleaseRow key={single.id} release={single} config={config} album={albumTarget} artist={artistTarget} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
