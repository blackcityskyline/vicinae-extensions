import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { recentTracks } from "~/api/lastfm";
import { Failed, needsSettings, NoSettings, Nothing, useConfig } from "~/components/state";
import { useQuery } from "~/hooks/use-query";
import { relativeTime } from "~/utils/when";
import { OpenOnSite } from "~/components/sites";

export default function Recent() {
  const config = useConfig();
  const ready = !needsSettings(config);

  const { items, error, isLoading, reload } = useQuery(
    () => recentTracks(config.apiKey, config.username),
    [config.apiKey, config.username],
  );

  if (!ready) return <List isLoading={false}>{NoSettings()}</List>;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search recent tracks">
      {error ? (
        Failed({ error })
      ) : items.length === 0 && !isLoading ? (
        Nothing({ title: "Nothing recent", subtitle: `Last.fm has no recent tracks for ${config.username}` })
      ) : (
        items.map((track) => (
          <List.Item
            key={`${track.url}-${track.played}`}
            icon={track.image ?? { source: Icon.Music }}
            title={track.name}
            subtitle={track.album ? `${track.artist} — ${track.album}` : track.artist}
            keywords={[track.name, track.artist, track.album]}
            accessories={
              track.played
                ? [
                    track.played === "now"
                      ? { tag: { value: "Playing", color: "green" }, tooltip: "Status" }
                      : { text: relativeTime(track.played), icon: Icon.Clock, tooltip: "Played" },
                  ]
                : undefined
            }
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open on Last.fm" url={track.url} icon={Icon.Globe01} />
                <OpenOnSite site="youtube-music" artist={track.artist} name={track.name} />
                <OpenOnSite site="monochrome" artist={track.artist} name={track.name} />
                <Action.CopyToClipboard title="Copy Track and Artist" content={`${track.name} — ${track.artist}`} icon={Icon.Link} />
                <Action.CopyToClipboard title="Copy Link" content={track.url} icon={Icon.Link} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={reload} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
