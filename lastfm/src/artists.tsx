import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { topArtists } from "~/api/lastfm";
import { Failed, needsSettings, NoSettings, Nothing, useConfig } from "~/components/state";
import { useQuery } from "~/hooks/use-query";

function plays(value: string): string {
  const count = Number(value);
  if (!Number.isFinite(count)) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M plays`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k plays`;
  return `${count} plays`;
}

export default function Artists() {
  const config = useConfig();
  const ready = !needsSettings(config);

  const { items, error, isLoading, reload } = useQuery(
    () => topArtists(config.apiKey, config.username, config.period),
    [config.apiKey, config.username, config.period],
  );

  if (!ready) return <List isLoading={false}>{NoSettings()}</List>;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search artists">
      {error ? (
        Failed({ error })
      ) : items.length === 0 && !isLoading ? (
        Nothing({ title: "No artists", subtitle: `Last.fm has no top artists for ${config.username}` })
      ) : (
        items.map((artist) => (
          <List.Item
            key={artist.url}
            icon={artist.image ?? { source: Icon.Person }}
            title={artist.name}
            accessories={[
              { text: plays(artist.playcount), icon: Icon.Star, tooltip: "Plays" },
              { text: `#${artist.rank}`, tooltip: "Rank" },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open on Last.fm" url={artist.url} icon={Icon.Globe01} />
                <Action.CopyToClipboard title="Copy Artist Name" content={artist.name} icon={Icon.Link} />
                <Action.CopyToClipboard title="Copy Link" content={artist.url} icon={Icon.Link} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={reload} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
