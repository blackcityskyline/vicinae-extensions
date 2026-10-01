import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { globalChart, libraryArtists, searchArtists, topTracks, weeklyChart } from "~/api/lastfm";
import { useConfig } from "~/components/state";
import type { Chart, LibraryPage, Match } from "~/api/lastfm";
import type { Artist, Track } from "~/utils/lastfm";
import { plays } from "~/utils/lastfm";
import ArtistPage from "~/artist";

/**
 * One command, five views. The only view that needs a username is the one that
 * is about you; the global charts work before anything has been configured.
 */
const VIEWS = [
  { id: "charts", title: "Global Charts" },
  { id: "weekly", title: "This Week" },
  { id: "tracks", title: "Your Top Tracks" },
  { id: "library", title: "Your Library" },
  { id: "find", title: "Find Artist" },
] as const;

type View = (typeof VIEWS)[number]["id"];

type Loaded<T> = { value: T | null; error: string | null; isLoading: boolean };

const NOTHING: Loaded<never> = { value: null, error: null, isLoading: true };

/** One request per view, and none at all until the view is asked for. */
function useLoaded<T>(load: (() => Promise<T>) | null, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>(NOTHING as Loaded<T>);

  useEffect(() => {
    if (!load) {
      setState(NOTHING as Loaded<T>);
      return;
    }

    let cancelled = false;
    setState({ value: null, error: null, isLoading: true });

    void load()
      .then((value) => {
        if (!cancelled) setState({ value, error: null, isLoading: false });
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setState({ value: null, error: failure instanceof Error ? failure.message : "Something went wrong.", isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function TrackRow({ entry, showArtist }: { entry: Track; showArtist?: boolean }) {
  return (
    <List.Item
      icon={entry.image ?? { source: Icon.Music }}
      title={entry.name}
      subtitle={showArtist ? entry.artist : entry.album ? `${entry.artist} — ${entry.album}` : entry.artist}
      keywords={[entry.name, entry.artist, entry.album]}
      accessories={[
        ...(entry.rank > 0 ? [{ text: `#${entry.rank}`, tooltip: "Position" }] : []),
        ...(entry.playcount ? [{ text: `${plays(entry.playcount)} plays`, icon: Icon.Star, tooltip: "Plays" }] : []),
      ]}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on Last.fm" url={entry.url} icon={Icon.Globe01} />
          <Action.CopyToClipboard title="Copy Track and Artist" content={`${entry.name} — ${entry.artist}`} icon={Icon.Link} />
          <Action.CopyToClipboard title="Copy Link" content={entry.url} icon={Icon.Link} />
        </ActionPanel>
      }
    />
  );
}

function ArtistRow({ entry, showPlays }: { entry: Artist; showPlays?: boolean }) {
  return (
    <List.Item
      icon={entry.image ?? { source: Icon.Person }}
      title={entry.name}
      keywords={[entry.name]}
      accessories={[
        ...(entry.rank > 0 ? [{ text: `#${entry.rank}`, tooltip: "Position" }] : []),
        ...(showPlays && entry.playcount ? [{ text: `${plays(entry.playcount)} plays`, icon: Icon.Star, tooltip: "Plays" }] : []),
      ]}
      actions={
        <ActionPanel>
          <Action.Push title="Show Artist" icon={Icon.Eye} target={<ArtistPage name={entry.name} />} />
          <Action.OpenInBrowser title="Open on Last.fm" url={entry.url} icon={Icon.Globe01} />
          <Action.CopyToClipboard title="Copy Artist Name" content={entry.name} icon={Icon.Link} />
          <Action.CopyToClipboard title="Copy Link" content={entry.url} icon={Icon.Link} />
        </ActionPanel>
      }
    />
  );
}

function MatchRow({ entry }: { entry: Match }) {
  return (
    <List.Item
      icon={entry.image ?? { source: Icon.Person }}
      title={entry.name}
      keywords={[entry.name]}
      accessories={entry.listeners ? [{ text: `${plays(entry.listeners)} listeners`, tooltip: "Listeners" }] : undefined}
      actions={
        <ActionPanel>
          <Action.Push title="Show Artist" icon={Icon.Eye} target={<ArtistPage name={entry.name} />} />
          <Action.OpenInBrowser title="Open on Last.fm" url={entry.url} icon={Icon.Globe01} />
          <Action.CopyToClipboard title="Copy Artist Name" content={entry.name} icon={Icon.Link} />
        </ActionPanel>
      }
    />
  );
}

export default function Browse() {
  const config = useConfig();
  const [view, setView] = useState<View>("charts");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<LibraryPage>({ artists: [], page: 1, hasMore: false });

  const personal = Boolean(config.apiKey && config.username);

  const charts = useLoaded<Chart>(() => globalChart(config.apiKey), [config.apiKey]);
  const weekly = useLoaded<Chart & { from?: string; to?: string }>(
    personal ? () => weeklyChart(config.apiKey, config.username) : null,
    [config.apiKey, config.username],
  );
  const tracks = useLoaded<Track[]>(
    personal ? () => topTracks(config.apiKey, config.username, config.period) : null,
    [config.apiKey, config.username, config.period],
  );

  // The library pages, so scrolling asks for more rather than loading it all.
  useEffect(() => {
    if (view !== "library" || !personal || library.artists.length > 0) return;
    void libraryArtists(config.apiKey, config.username, 1).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, personal, config.apiKey, config.username]);

  const found = useLoaded<Match[]>(
    view === "find" && config.apiKey && query.trim().length > 1
      ? () => searchArtists(config.apiKey, query)
      : null,
    [view, config.apiKey, query],
  );

  const searching = view === "find" && query.trim().length > 1;

  return (
    <List
      isLoading={view === "library" ? false : searching ? found.isLoading : (view === "charts" ? charts : view === "weekly" ? weekly : tracks).isLoading}
      filtering={!searching}
      searchText={searching ? undefined : query}
      onSearchTextChange={searching ? undefined : setQuery}
      searchBarPlaceholder={
        searching ? `Search artists for "${query}"` : "Search this view"
      }
      searchBarAccessory={
        <List.Dropdown tooltip="What to show" value={view} onChange={(value) => setView(value as View)} storeValue>
          {VIEWS.map((item) => (
            <List.Dropdown.Item key={item.id} title={item.title} value={item.id} />
          ))}
        </List.Dropdown>
      }
      pagination={
        view === "library"
          ? {
              hasMore: library.hasMore,
              onLoadMore: async () => {
                if (!personal) return;
                const next = await libraryArtists(config.apiKey, config.username, library.page + 1).catch(() => undefined);
                if (next) setLibrary({ artists: [...library.artists, ...next.artists], page: next.page, hasMore: next.hasMore });
              },
            }
          : undefined
      }
    >
      {!personal && view !== "charts" && (
        <List.Section title="Needs your username">
          <List.Item icon={Icon.Cog} title="Set up Last.fm first" subtitle="Add the API key and username in settings" />
        </List.Section>
      )}

      {view === "charts" &&
        (charts.error ? (
          <List.EmptyView title="Last.fm could not be reached" description={charts.error} icon={Icon.XMarkCircle} />
        ) : (
          <>
            <List.Section title="Chart: top artists">
              {(charts.value?.artists ?? []).map((entry) => (
                <ArtistRow key={entry.url} entry={entry} showPlays />
              ))}
            </List.Section>
            <List.Section title="Chart: top tracks">
              {(charts.value?.tracks ?? []).map((entry) => (
                <TrackRow key={entry.url} entry={entry} showArtist />
              ))}
            </List.Section>
          </>
        ))}

      {view === "weekly" &&
        (weekly.error ? (
          <List.EmptyView title="Last.fm could not be reached" description={weekly.error} icon={Icon.XMarkCircle} />
        ) : (
          <>
            <List.Section title="This week: artists">
              {(weekly.value?.artists ?? []).map((entry) => (
                <ArtistRow key={entry.url} entry={entry} />
              ))}
            </List.Section>
            <List.Section title="This week: tracks">
              {(weekly.value?.tracks ?? []).map((entry) => (
                <TrackRow key={entry.url} entry={entry} showArtist />
              ))}
            </List.Section>
          </>
        ))}

      {view === "tracks" &&
        (tracks.error ? (
          <List.EmptyView title="Last.fm could not be reached" description={tracks.error} icon={Icon.XMarkCircle} />
        ) : (
          <List.Section title="Your top tracks">
            {(tracks.value ?? []).map((entry) => (
              <TrackRow key={entry.url} entry={entry} showArtist />
            ))}
          </List.Section>
        ))}

      {view === "library" && personal && (
        <List.Section title={`Your library (${library.artists.length})`}>
          {library.artists.map((entry) => (
            <ArtistRow key={entry.url} entry={entry} />
          ))}
        </List.Section>
      )}

      {searching &&
        (found.error ? (
          <List.EmptyView title="Last.fm could not be reached" description={found.error} icon={Icon.XMarkCircle} />
        ) : (found.value ?? []).length === 0 && !found.isLoading ? (
          <List.EmptyView title="No artists" description={`Last.fm found nothing for "${query}"`} icon={Icon.MagnifyingGlass} />
        ) : (
          <List.Section title={`Matches for "${query}"`}>
            {(found.value ?? []).map((entry) => (
              <MatchRow key={entry.url} entry={entry} />
            ))}
          </List.Section>
        ))}
    </List>
  );
}
