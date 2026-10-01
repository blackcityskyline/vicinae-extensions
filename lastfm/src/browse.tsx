import React, { useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, getPreferenceValues } from "@raycast/api";

import { ArtistRow, TrackRow } from "~/components/rows";
import { globalChart, libraryArtists, searchArtists, weeklyChart } from "~/functions/browse";
import type { LfmArtist, LfmTrack } from "~/utils/lastfm";

/**
 * Browse: the four things the six reference commands do not do.
 *
 *   Global Charts   the worldwide charts, no account needed
 *   This Week      the account's weekly charts
 *   Your Library   every artist in the library, paged as you scroll
 *   Find Artist    search, and an artist page from the result
 *
 * The reference has no artist page at all — an artist name is a title and a link —
 * so `Show Artist` is the one thing here with nothing to copy.
 */

type View = "charts" | "weekly" | "library" | "search";

type Chart = { artists: LfmArtist[]; tracks: LfmTrack[] };
type Loaded<T> = { value: T | null; error: string | null; isLoading: boolean };

const PENDING: Loaded<never> = { value: null, error: null, isLoading: true };

export default function Browse(): React.ReactElement {
  const { apikey, username } = getPreferenceValues<Preferences>();
  const key = apikey ?? "";
  const user = username ?? "";

  const [view, setView] = useState<View>("charts");
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");

  const [chart, setChart] = useState<Loaded<Chart>>(PENDING);
  const [weekly, setWeekly] = useState<Loaded<Chart>>({ value: null, error: null, isLoading: false });
  const [found, setFound] = useState<Loaded<LfmArtist[]>>({ value: null, error: null, isLoading: false });
  const [library, setLibrary] = useState<Loaded<LfmArtist[]>>(PENDING);

  useEffect(() => {
    let live = true;
    setChart(PENDING);

    globalChart(key).then(
      (value) => live && setChart({ value, error: null, isLoading: false }),
      (error: unknown) => live && setChart({ value: null, error: text(error), isLoading: false }),
    );

    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    if (view !== "weekly" || user === "") return;

    let live = true;
    setWeekly(PENDING);

    weeklyChart(key, user).then(
      (value) => live && setWeekly({ value, error: null, isLoading: false }),
      (error: unknown) => live && setWeekly({ value: null, error: text(error), isLoading: false }),
    );

    return () => {
      live = false;
    };
  }, [view, key, user]);

  useEffect(() => {
    if (view !== "search" || asked === "") return;

    let live = true;
    setFound(PENDING);

    searchArtists(key, asked).then(
      (value) => live && setFound({ value, error: null, isLoading: false }),
      (error: unknown) => live && setFound({ value: null, error: text(error), isLoading: false }),
    );

    return () => {
      live = false;
    };
  }, [view, key, asked]);

  // The library pages, and only while its view is open, so opening the command
  // costs one request rather than three. Paged by hand: `useCachedPromise` wants
  // `(page, ...args)` with the page first, which does not fit the three arguments
  // this view needs.
  useEffect(() => {
    if (view !== "library" || user === "") return;

    let live = true;
    setLibrary(PENDING);

    libraryArtists(key, user, 1).then(
      (value) => live && setLibrary({ value, error: null, isLoading: false }),
      (error: unknown) => live && setLibrary({ value: null, error: text(error), isLoading: false }),
    );

    return () => {
      live = false;
    };
  }, [view, key, user]);

  if (key === "" || user === "") return <Setup />;

  const loading =
    (view === "charts" && chart.isLoading) ||
    (view === "weekly" && weekly.isLoading) ||
    (view === "library" && library.isLoading) ||
    (view === "search" && found.isLoading);

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder={view === "search" ? "Find an artist" : "Filter"}
      searchText={view === "search" ? query : ""}
      onSearchTextChange={(next) => {
        setQuery(next);
        if (next.trim().length >= 2) setAsked(next.trim());
      }}
      searchBarAccessory={
        <List.Dropdown value={view} tooltip="View" onChange={(next) => setView(next as View)}>
          <List.Dropdown.Item title="Global Charts" value="charts" icon={Icon.Globe} />
          <List.Dropdown.Item title="This Week" value="weekly" icon={Icon.Calendar} />
          <List.Dropdown.Item title="Your Library" value="library" icon={Icon.Folder} />
          <List.Dropdown.Item title="Find Artist" value="search" icon={Icon.MagnifyingGlass} />
        </List.Dropdown>
      }
    >
      {view === "charts" && chart.error ? <Failed error={chart.error} /> : null}
      {view === "charts" && chart.value ? <ChartRows chart={chart.value} query={query} /> : null}

      {view === "weekly" && weekly.error ? <Failed error={weekly.error} /> : null}
      {view === "weekly" && weekly.value ? (
        <ChartRows chart={weekly.value} query={query} week={true} />
      ) : null}

      {view === "library" && library.error ? <Failed error={library.error} /> : null}
      {view === "library" && library.value ? (
        <List.Section title="Your Library" subtitle={`${library.value.length}`}>
          {library.value.map((artist, index) => (
            <ArtistRow key={`${artist.name}-${index}`} artist={artist} query={query} />
          ))}
          <List.Item
            title="Load more"
            icon={Icon.ArrowDown}
            actions={
              <ActionPanel>
                <Action
                  title="Load More Artists"
                  icon={Icon.ArrowDown}
                  onAction={async () => {
                    const next = await libraryArtists(key, user, library.value!.length + 1).catch(() => []);
                    if (next.length === 0) return;
                    setLibrary({
                      value: [...library.value!, ...next],
                      error: null,
                      isLoading: false,
                    });
                  }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {view === "search" && found.error ? <Failed error={found.error} /> : null}
      {view === "search" && !found.error && asked === "" ? (
        <List.EmptyView title="Find an artist" description="Type at least two letters." icon={Icon.MagnifyingGlass} />
      ) : null}
      {view === "search" && found.value && found.value.length === 0 && !found.isLoading ? (
        <List.EmptyView
          title="No artists found"
          description={`Last.fm has nothing matching “${asked}”.`}
          icon={Icon.MagnifyingGlass}
        />
      ) : null}
      {view === "search" && found.value && found.value.length > 0 ? (
        <List.Section title="Results" subtitle={`${found.value.length}`}>
          {found.value.map((artist, index) => (
            <ArtistRow key={`${artist.name}-${index}`} artist={artist} query={query} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

function ChartRows({ chart, query, week }: { chart: Chart; query: string; week?: boolean }) {
  return (
    <>
      <List.Section title={week ? "Artists This Week" : "Top Artists"} subtitle={`${chart.artists.length}`}>
        {chart.artists.map((artist, index) => (
          <ArtistRow key={`${artist.name}-${index}`} artist={artist} query={query} />
        ))}
      </List.Section>
      <List.Section title={week ? "Tracks This Week" : "Top Tracks"} subtitle={`${chart.tracks.length}`}>
        {chart.tracks.map((track, index) => (
          <TrackRow key={`${track.name}-${index}`} track={track} query={query} />
        ))}
      </List.Section>
    </>
  );
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Failed({ error }: { error: string }): React.ReactElement {
  return <List.EmptyView title="Last.fm could not be reached" description={error} icon={Icon.XMarkCircle} />;
}

function Setup(): React.ReactElement {
  return (
    <List.EmptyView
      title="Set up Last.fm first"
      description="Add your API key and Last.fm username in this extension's settings."
      icon={Icon.Cog}
    />
  );
}