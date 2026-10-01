import React from "react";
import { Action, ActionPanel, Detail, Icon, List, open } from "@raycast/api";

import { ArtistDetail } from "~/components/artist-detail";
import { OpenOnSites } from "~/components/open-on";
import { imageUrl, named, type LfmArtist, type LfmTrack } from "~/utils/lastfm";
import { siteQuery, siteSearchUrl } from "~/utils/sites";

/**
 * One row, and the actions the reference does not have.
 *
 * Two things are added to every row:
 *
 * - `keywords`. The reference passes none on any `List.Item`, while the search bar
 *   is the field the text is typed into. The list filters rows against that text, so
 *   a row titled "привет" is filtered out by the word "hello" and the list empties
 *   itself as you type.
 * - somewhere to go from a row: Last.fm, YouTube Music and Monochrome.
 */

export { siteQuery, siteSearchUrl };

/** The words a row can be found by, with nothing empty and nothing twice. */
export function rowKeywords(extra: (string | undefined)[], ...rest: string[]): string[] {
  return [...new Set([...extra, ...rest].map((word) => word?.trim()).filter((word): word is string => Boolean(word)))];
}

export function TrackRow({ track, query }: { track: LfmTrack; query?: string }) {
  const artist = named(track.artist);
  const album = named(track.album, "");
  const plays = track.playcount ?? track.listeners;
  const search = siteQuery({ artist: named(track.artist, ""), name: track.name });

  return (
    <List.Item
      title={track.name}
      keywords={rowKeywords([query, track.name, artist, album])}
      icon={imageUrl(track.image)}
      accessories={[
        { text: album },
        { text: plays ? `${plays} ${track.playcount ? "plays" : "listeners"}` : "" },
      ]}
      detail={
        <Detail
          markdown={[
            `# ${track.name}`,
            "",
            `- **Artist**: ${artist}`,
            ...(album ? [`- **Album**: ${album}`] : []),
            ...(track.url ? [`- [Last.fm](${track.url})`] : []),
          ].join("\n")}
        />
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={track.url} title="Open on Last.fm" icon={Icon.Globe} />
          <OpenOnSites subject={{ artist: named(track.artist, ""), name: track.name }} />
          <Action.CopyToClipboard
            title="Copy Track and Artist"
            content={`${track.name} — ${artist}`}
            icon={Icon.Clipboard}
          />
          <Action.CopyToClipboard title="Copy Link" content={track.url} icon={Icon.Link} />
        </ActionPanel>
      }
    />
  );
}

export function ArtistRow({ artist, query }: { artist: LfmArtist; query?: string }) {
  const plays = artist.playcount ?? artist.listeners;

  return (
    <List.Item
      title={artist.name}
      keywords={rowKeywords([query, artist.name])}
      icon={imageUrl(artist.image)}
      accessories={[{ text: plays ? `${plays} ${artist.playcount ? "plays" : "listeners"}` : "" }]}
      actions={
        <ActionPanel>
          <Action.Push
            title="Show Artist"
            icon={Icon.Eye}
            target={<ArtistDetail name={artist.name} />}
          />
          <Action.OpenInBrowser url={artist.url} title="Open on Last.fm" icon={Icon.Globe} />
          <OpenOnSites subject={{ name: artist.name }} />
          <Action.CopyToClipboard title="Copy Artist Name" content={artist.name} icon={Icon.Link} />
          <Action.CopyToClipboard title="Copy Link" content={artist.url} icon={Icon.Link} />
        </ActionPanel>
      }
    />
  );
}