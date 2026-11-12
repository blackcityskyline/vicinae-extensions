import {
  Action,
  ActionPanel,
  Icon,
  List,
  LocalStorage,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import { decodeSession, type Account, type Session } from "~/api/auth";
import { searchArtists, searchCatalog, searchReleases, searchTracks } from "~/api/monochrome";
import { buildConfig } from "~/api/player";
import { searchPodcasts } from "~/api/podcasts";
import { SignInView } from "~/components/sign-in";
import { ArtistView } from "~/components/artist";
import { AlbumView } from "~/components/album";
import { PodcastView } from "~/components/podcast";
import { ArtistRow, PodcastRow, ReleaseRow, TrackRow } from "~/components/rows";
import { NowPlayingView } from "~/now-playing";
import {
  sortArtists,
  sortReleases,
  sortTracks,
  type ArtistSummary,
  type ReleaseSummary,
  type SearchResults,
  type SortOrder,
  type Track,
} from "~/utils/monochrome";
import type { Podcast } from "~/utils/podcasts";

type Preferences = {
  player?: string;
  playerArgs?: string;
  playerWindow?: boolean;
  downloadDir?: string;
  podcastKey?: string;
  podcastSecret?: string;
};

/**
 * Encrypted by Vicinae; `vicinae.db` holds it, not the plain-text settings file. The stored
 * value is the token together with the identity the sign-in reply named.
 */
const SESSION_KEY = "session";

/** The catalog paginates nothing, so the list reveals what arrived a page at a time. */
const PAGE = 25;

type Category = "all" | "tracks" | "albums" | "artists" | "podcasts";

const CATEGORIES: Array<{ value: Category; title: string }> = [
  { value: "all", title: "Everything" },
  { value: "tracks", title: "Tracks" },
  { value: "albums", title: "Albums" },
  { value: "artists", title: "Artists" },
  { value: "podcasts", title: "Podcasts" },
];

type Results = SearchResults & { podcasts: Podcast[] };

const EMPTY: Results = { tracks: [], releases: [], artists: [], podcasts: [] };

const SORTS: Array<{ value: SortOrder; title: string }> = [
  { value: "relevance", title: "Relevance" },
  { value: "title", title: "Title" },
];

function AccountRow({
  account,
  onSignIn,
  onSignOut,
}: {
  account: Account | undefined;
  onSignIn: (session: Session) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const signedIn = account !== undefined;
  const title = signedIn ? (account.name ?? account.email ?? "Signed in") : "Not signed in";
  const subtitle = signedIn
    ? (account.email ?? "Signed in to Monochrome")
    : "Sign in or create an account.";

  return (
    <List.Item
      title={title}
      subtitle={subtitle}
      icon={signedIn ? Icon.Person : Icon.Lock}
      actions={
        <ActionPanel>
          {signedIn ? (
            <Action
              title="Open Extension Preferences"
              icon={Icon.Cog}
              shortcut="open"
              onAction={() => void openExtensionPreferences()}
            />
          ) : (
            <Action.Push
              title="Sign In…"
              icon={Icon.Lock}
              shortcut="open"
              target={<SignInView mode="in" onSignedIn={onSignIn} />}
            />
          )}
          {signedIn ? null : (
            <Action.Push
              title="Create an Account…"
              icon={Icon.Person}
              shortcut={{ modifiers: ["ctrl"], key: "n" }}
              target={<SignInView mode="up" onSignedIn={onSignIn} />}
            />
          )}
          {signedIn ? (
            <Action
              title="Sign Out"
              icon={Icon.LockDisabled}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
              onAction={() => void onSignOut()}
            />
          ) : null}
          {signedIn ? null : (
            <Action
              title="Open Extension Preferences"
              icon={Icon.Cog}
              shortcut={{ modifiers: ["ctrl"], key: "," }}
              onAction={() => void openExtensionPreferences()}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

function SortRow({ sort, onSort }: { sort: SortOrder; onSort: (order: SortOrder) => void }) {
  return (
    <List.Item
      title={`Sort by ${SORTS.find((entry) => entry.value === sort)?.title ?? "Relevance"}`}
      subtitle="The catalog answers unsorted; the list does the ordering"
      icon={Icon.BarChart}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Sort">
            {SORTS.map((entry) => (
              <Action
                key={entry.value}
                title={entry.title}
                icon={entry.value === sort ? Icon.CheckCircle : Icon.Circle}
                onAction={() => onSort(entry.value)}
              />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default function SearchCommand() {
  const [preferences] = useState(() => getPreferenceValues<Preferences>());
  const [config] = useState(() => buildConfig(preferences));

  const [session, setSession] = useState<Session | undefined>(undefined);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    LocalStorage.getItem<string>(SESSION_KEY)
      .then((stored) => {
        if (!cancelled) setSession(decodeSession(stored ?? undefined));
      })
      .catch(() => {
        // an unreadable store is the same as no session: sign in again
        if (!cancelled) setSession(undefined);
      })
      .finally(() => {
        if (!cancelled) setSessionLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptSession = async (found: Session): Promise<void> => {
    try {
      await LocalStorage.setItem(SESSION_KEY, JSON.stringify(found));
    } catch (error) {
      await showToast(
        Toast.Style.Failure,
        "Signed in, but the session could not be saved",
        error instanceof Error ? error.message : String(error),
      );
    }
    setSession(found);
  };

  const forgetSession = async (): Promise<void> => {
    try {
      await LocalStorage.removeItem(SESSION_KEY);
    } catch (error) {
      await showToast(
        Toast.Style.Failure,
        "Could not clear the session",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    setSession(undefined);
  };

  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<SortOrder>("relevance");
  const [results, setResults] = useState<Results>(EMPTY);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const trimmed = text.trim();
  const tooShort = trimmed.length < 2;

  useEffect(() => {
    if (tooShort) {
      setResults(EMPTY);
      setSearchProblem(null);
      setWaiting(false);
      return;
    }

    let cancelled = false;
    setWaiting(true);

    // the catalog answers in hundreds of milliseconds, so wait for a pause in typing
    const timer = setTimeout(() => {
      const load = async (): Promise<Results> => {
        if (category === "artists") {
          return { ...EMPTY, artists: await searchArtists(trimmed) };
        }
        if (category === "albums") {
          return { ...EMPTY, releases: await searchReleases(trimmed) };
        }
        if (category === "tracks") {
          return { ...EMPTY, tracks: await searchTracks(trimmed) };
        }
        if (category === "podcasts") {
          return { ...EMPTY, podcasts: await searchPodcasts(trimmed, config) };
        }
        return { ...(await searchCatalog(trimmed)), podcasts: [] };
      };

      load()
        .then((found) => {
          if (cancelled) return;
          setResults(found);
          setSearchProblem(null);
          setVisible(PAGE);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setResults(EMPTY);
          setSearchProblem(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setWaiting(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort, category]);

  const albumTarget = (id: string) => <AlbumView releaseId={id} config={config} />;
  const artistTarget = (id: string) => <ArtistView artistId={id} config={config} />;

  const tracks = sortTracks(results.tracks, sort);
  const releases = sortReleases(results.releases, sort);
  const artists = sortArtists(results.artists, sort);
  const podcasts = results.podcasts;

  const rows =
    category === "tracks"
      ? tracks.length
      : category === "albums"
        ? releases.length
        : category === "artists"
          ? artists.length
          : category === "podcasts"
            ? podcasts.length
            : 0;
  const hasMore = rows > visible;
  const total = tracks.length + releases.length + artists.length + podcasts.length;
  const nothing = !tooShort && !waiting && total === 0;

  const trackRow = (track: Track) => (
    <TrackRow
      key={track.id}
      track={track}
      config={config}
      album={albumTarget}
      artist={artistTarget}
    />
  );
  const releaseRow = (release: ReleaseSummary) => (
    <ReleaseRow
      key={release.id}
      release={release}
      config={config}
      album={albumTarget}
      artist={artistTarget}
    />
  );
  const artistRow = (artist: ArtistSummary) => (
    <ArtistRow key={artist.id} artist={artist} config={config} view={artistTarget} />
  );
  const podcastTarget = (id: string) => {
    const found = podcasts.find((podcast) => String(podcast.id) === id);
    return found ? <PodcastView podcast={found} config={config} /> : null;
  };
  const podcastRow = (podcast: Podcast) => (
    <PodcastRow key={podcast.id} podcast={podcast} view={podcastTarget} />
  );

  return (
    <List
      navigationTitle="Monochrome"
      isLoading={!sessionLoaded || waiting}
      isShowingDetail
      throttle
      searchBarPlaceholder="Search Monochrome's lossless catalog"
      searchBarAccessory={
        <List.Dropdown
          tooltip="What to search"
          value={category}
          onChange={(value: string) => setCategory(value as Category)}
        >
          {CATEGORIES.map((entry) => (
            <List.Dropdown.Item key={entry.value} value={entry.value} title={entry.title} />
          ))}
        </List.Dropdown>
      }
      onSearchTextChange={setText}
      pagination={{
        hasMore,
        onLoadMore: () => setVisible((current) => current + PAGE),
      }}
    >
      {trimmed.length === 0 ? (
        <>
          <List.Section title="Account">
            <AccountRow
              account={session ? session.account : undefined}
              onSignIn={adoptSession}
              onSignOut={forgetSession}
            />
          </List.Section>
          <List.Section title="Player">
            <List.Item
              title="Now Playing"
              subtitle="Pause, skip and stop the shared mpv"
              icon={Icon.Headphones}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Now Playing"
                    icon={Icon.Headphones}
                    shortcut="open"
                    target={<NowPlayingView config={config} />}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
        </>
      ) : null}

      {tooShort && trimmed.length > 0 ? (
        <List.EmptyView
          icon={Icon.Music}
          title="Keep typing"
          description="Monochrome's search needs at least two characters."
        />
      ) : null}

      {category === "all" && tracks.length > 0 ? (
        <List.Section title="Tracks">{tracks.map(trackRow)}</List.Section>
      ) : null}
      {category === "all" && releases.length > 0 ? (
        <List.Section title="Albums">{releases.map(releaseRow)}</List.Section>
      ) : null}
      {category === "all" && artists.length > 0 ? (
        <List.Section title="Artists">{artists.map(artistRow)}</List.Section>
      ) : null}

      {category === "tracks" && tracks.length > 0 ? (
        <List.Section title="Tracks">{tracks.slice(0, visible).map(trackRow)}</List.Section>
      ) : null}
      {category === "albums" && releases.length > 0 ? (
        <List.Section title="Albums">{releases.slice(0, visible).map(releaseRow)}</List.Section>
      ) : null}
      {category === "artists" && artists.length > 0 ? (
        <List.Section title="Artists">{artists.slice(0, visible).map(artistRow)}</List.Section>
      ) : null}
      {category === "podcasts" && podcasts.length > 0 ? (
        <List.Section title="Podcasts">{podcasts.slice(0, visible).map(podcastRow)}</List.Section>
      ) : null}

      {/* last, so the first result stays selected */}
      {!tooShort && total > 0 ? <SortRow sort={sort} onSort={setSort} /> : null}

      {nothing ? (
        <List.EmptyView
          icon={searchProblem ? Icon.Warning : Icon.Music}
          title={searchProblem ? "Could not search" : `Nothing for “${trimmed}”`}
          description={
            searchProblem ?? "Check the spelling, or search for the artist instead of the song."
          }
        />
      ) : null}
    </List>
  );
}
