import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { lovedTracks } from "~/api/lastfm";
import { Failed, needsSettings, NoSettings, Nothing, useConfig } from "~/components/state";
import { useQuery } from "~/hooks/use-query";
import { absoluteTime } from "~/utils/when";
import { OpenInYouTubeMusic } from "~/components/youtube";

export default function Loved() {
  const config = useConfig();
  const ready = !needsSettings(config);

  const { items, error, isLoading, reload } = useQuery(
    () => lovedTracks(config.apiKey, config.username),
    [config.apiKey, config.username],
  );

  if (!ready) return <List isLoading={false}>{NoSettings()}</List>;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search loved tracks">
      {error ? (
        Failed({ error })
      ) : items.length === 0 && !isLoading ? (
        Nothing({ title: "Nothing loved", subtitle: `${config.username} has not loved a track yet` })
      ) : (
        items.map((track) => (
          <List.Item
            key={track.url}
            icon={track.image ?? { source: Icon.Heart }}
            title={track.name}
            subtitle={track.album ? `${track.artist} — ${track.album}` : track.artist}
            keywords={[track.name, track.artist, track.album]}
            accessories={track.loved ? [{ text: absoluteTime(track.loved), icon: Icon.Heart, tooltip: "Loved" }] : undefined}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open on Last.fm" url={track.url} icon={Icon.Globe01} />
                <OpenInYouTubeMusic artist={track.artist} name={track.name} />
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
