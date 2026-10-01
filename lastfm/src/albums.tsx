import { Action, ActionPanel, Icon, List } from "@vicinae/api";

import { topAlbums } from "~/api/lastfm";
import { Failed, needsSettings, NoSettings, Nothing, useConfig } from "~/components/state";
import { useQuery } from "~/hooks/use-query";
import { OpenOnSite } from "~/components/sites";

function plays(value: string | undefined): string {
  const count = Number(value);
  if (!Number.isFinite(count)) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M plays`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k plays`;
  return `${count} plays`;
}

export default function Albums() {
  const config = useConfig();
  const ready = !needsSettings(config);

  const { items, error, isLoading, reload } = useQuery(
    () => topAlbums(config.apiKey, config.username, config.period),
    [config.apiKey, config.username, config.period],
  );

  if (!ready) return <List isLoading={false}>{NoSettings()}</List>;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search albums">
      {error ? (
        Failed({ error })
      ) : items.length === 0 && !isLoading ? (
        Nothing({ title: "No albums", subtitle: `Last.fm has no top albums for ${config.username}` })
      ) : (
        items.map((album) => (
          <List.Item
            key={album.url}
            icon={album.image ?? { source: Icon.Music }}
            title={album.name}
            subtitle={album.artist}
            keywords={[album.name, album.artist]}
            accessories={[
              { text: plays(album.playcount), icon: Icon.Star, tooltip: "Plays" },
              { text: `#${album.rank}`, tooltip: "Rank" },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open on Last.fm" url={album.url} icon={Icon.Globe01} />
                <OpenOnSite site="youtube-music" artist={album.artist} name={album.name} />
                <OpenOnSite site="monochrome" artist={album.artist} name={album.name} />
                <Action.CopyToClipboard title="Copy Album and Artist" content={`${album.name} — ${album.artist}`} icon={Icon.Link} />
                <Action.CopyToClipboard title="Copy Link" content={album.url} icon={Icon.Link} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={reload} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
