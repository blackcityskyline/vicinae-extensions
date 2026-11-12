import { Action, ActionPanel, Icon, List, Toast, showToast } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { readConfig } from "~/api/config";
import { appendSearchHistory, readLibrary, readSearchHistory } from "~/api/library";
import { useListing, usePlaylistActions } from "~/components/hooks";
import { MiscMenu } from "~/components/misc";
import { ChannelList, CustomPlaylistList, PlaylistResults, VideoList, VideoRow } from "~/components/views";
import type { Config } from "~/types";
import { countLabel } from "~/utils/state";
import { applySearchFilters, expandHistoryRecall, searchUrl } from "~/utils/search";

const YOUTUBE = "https://www.youtube.com";

type RemoteView = {
  title: string;
  subtitle: string;
  path: string;
  icon: Icon;
};

const FEEDS: RemoteView[] = [
  { title: "Your Feed", subtitle: "YouTube's recommendations", path: "/", icon: Icon.Rss },
  {
    title: "Subscriptions Feed",
    subtitle: "Latest videos from the channels you follow",
    path: "/feed/subscriptions",
    icon: Icon.PersonLines,
  },
];

const LIBRARY_VIEWS: RemoteView[] = [
  { title: "Watch Later", subtitle: "YouTube's Watch Later playlist", path: "/playlist?list=WL", icon: Icon.Clock },
  { title: "Liked Videos", subtitle: "Videos you liked on YouTube", path: "/playlist?list=LL", icon: Icon.Heart },
  { title: "Watch History", subtitle: "Your YouTube watch history", path: "/feed/history", icon: Icon.BulletPoints },
  { title: "Clips", subtitle: "Clips YouTube made for you", path: "/feed/clips", icon: Icon.FilmStrip },
];

function openRemote(view: RemoteView, config: Config, savedIds: ReadonlySet<string>, onSavedChange: (id: string, saved: boolean) => void) {
  return (
    <ActionPanel>
      <Action.Push
        title={`Open ${view.title}`}
        icon={view.icon}
        shortcut="open"
        target={
          <VideoList
            title={view.title}
            target={`${YOUTUBE}${view.path}`}
            config={config}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
          />
        }
      />
    </ActionPanel>
  );
}

/** Menus are rows too, so the side pane explains the row under the cursor. */
function menuDetail(title: string, subtitle: string) {
  return <List.Item.Detail markdown={`**${title}**\n\n${subtitle}`} />;
}

export default function BrowseCommand() {
  const config = useMemo(() => readConfig(), []);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const { library, problem } = useMemo(
    () => readLibrary(config.configDir),
    // re-read after a save so the Saved view is not a snapshot
    [config, libraryVersion],
  );

  const [savedIds, setSavedIds] = useState(() => new Set(library.saved.map((video) => video.id)));
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);

  const trimmed = query.trim();
  const listing = useListing(config, target);
  const playlistFor = usePlaylistActions(config);

  useEffect(() => {
    if (problem) void showToast(Toast.Style.Failure, "Could not read the yt-x library", problem);
  }, [problem]);

  useEffect(() => {
    if (trimmed.length < 2) {
      setTarget(undefined);
      setWaiting(false);
      return;
    }

    setWaiting(true);

    // yt-dlp takes a second or more per search, so wait for a pause in typing.
    const timer = setTimeout(() => {
      const expanded = expandHistoryRecall(trimmed, readSearchHistory(config.cacheDir));
      const applied = applySearchFilters(expanded);

      if (config.searchHistory) {
        try {
          appendSearchHistory(expanded, config.cacheDir);
        } catch {
          // The search matters more than its history entry.
        }
      }

      setTarget(searchUrl(applied.term, applied.sp));
      setWaiting(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [config, trimmed]);

  function markSaved(id: string, saved: boolean): void {
    setSavedIds((previous) => {
      const next = new Set(previous);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
    setLibraryVersion((version) => version + 1);
  }

  const playlist = target ? playlistFor(listing.title ?? `Search: ${trimmed}`, target) : undefined;

  return (
    <List
      navigationTitle="yt-x"
      searchBarPlaceholder="Search YouTube, or pick something from the yt-x library"
      isLoading={listing.isLoading || waiting}
      isShowingDetail
      onSearchTextChange={setQuery}
      pagination={target ? { hasMore: listing.hasMore, onLoadMore: listing.loadMore } : undefined}
    >
      {trimmed.length === 0 ? (
        <>
          <List.Section title="Feeds">
            {FEEDS.map((view) => (
              <List.Item
                key={view.title}
                title={view.title}
                subtitle={view.subtitle}
                icon={view.icon}
                detail={menuDetail(view.title, view.subtitle)}
                actions={openRemote(view, config, savedIds, markSaved)}
              />
            ))}
          </List.Section>
          <List.Section title="Library">
            {LIBRARY_VIEWS.map((view) => (
              <List.Item
                key={view.title}
                title={view.title}
                subtitle={view.subtitle}
                icon={view.icon}
                detail={menuDetail(view.title, view.subtitle)}
                actions={openRemote(view, config, savedIds, markSaved)}
              />
            ))}
            <List.Item
              title="Recent"
              subtitle={countLabel(library.recent.length, "video")}
              icon={Icon.Clock}
              detail={menuDetail("Recent", "Videos you played recently")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Recent"
                    shortcut="open"
                    target={
                      <VideoList
                        title="Recent"
                        videos={library.recent}
                        config={config}
                        savedIds={savedIds}
                        onSavedChange={markSaved}
                      />
                    }
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title="My Videos"
              subtitle={countLabel(library.saved.length, "saved video")}
              icon={Icon.Star}
              detail={menuDetail("My Videos", "Videos you saved in yt-x")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open My Videos"
                    shortcut="open"
                    target={
                      <VideoList
                        title="My Videos"
                        videos={library.saved}
                        config={config}
                        savedIds={savedIds}
                        onSavedChange={markSaved}
                        removeOnUnsave
                      />
                    }
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title="My Playlists"
              subtitle={countLabel(library.playlists.length, "playlist")}
              icon={Icon.BulletPoints}
              detail={menuDetail("My Playlists", "Playlists you saved in yt-x")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open My Playlists"
                    shortcut="open"
                    target={
                      <CustomPlaylistList
                        playlists={library.playlists}
                        config={config}
                        savedIds={savedIds}
                        onSavedChange={markSaved}
                      />
                    }
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title="Channels"
              subtitle={countLabel(library.channels.length, "channel")}
              icon={Icon.PersonLines}
              detail={menuDetail("Channels", "Channels you follow")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Channels"
                    shortcut="open"
                    target={
                      <ChannelList
                        title="Subscriptions"
                        channels={library.channels}
                        config={config}
                        savedIds={savedIds}
                        onSavedChange={markSaved}
                      />
                    }
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          <List.Section title="Playlists">
            <List.Item
              title="Playlists"
              subtitle="Playlists saved on YouTube"
              icon={Icon.Bookmark}
              detail={menuDetail("Playlists", "Playlists saved on YouTube")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Playlists"
                    shortcut="open"
                    target={
                      <PlaylistResults
                        title="Playlists"
                        target={`${YOUTUBE}/feed/playlists`}
                        config={config}
                        savedIds={savedIds}
                        onSavedChange={markSaved}
                      />
                    }
                  />
                </ActionPanel>
              }
            />
          </List.Section>
          <List.Section title="yt-x">
            <List.Item
              title="Miscellaneous"
              subtitle="Explore, search history, custom commands, config files, sync"
              icon={Icon.Cog}
              detail={menuDetail("Miscellaneous", "Explore, search history, custom commands, config files, sync")}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Open Miscellaneous"
                    icon={Icon.Cog}
                    shortcut="open"
                    target={<MiscMenu config={config} savedIds={savedIds} onSavedChange={markSaved} />}
                  />
                </ActionPanel>
              }
            />
          </List.Section>
        </>
      ) : trimmed.length < 2 ? (
        <List.EmptyView title="Keep typing" description="Two characters are enough to search YouTube." />
      ) : listing.problem ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Search failed"
          description={listing.problem}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Search URL" content={target ?? ""} shortcut="copy" />
            </ActionPanel>
          }
        />
      ) : listing.entries.length === 0 && !listing.isLoading && !waiting ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No videos found"
          description="Try different words. yt-x's `:today`, `:4k` and other filters work here too."
        />
      ) : (
        <List.Section title="YouTube" subtitle={countLabel(listing.entries.length, "video")}>
          {listing.entries.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              config={config}
              savedIds={savedIds}
              saved={savedIds.has(video.id)}
              onSavedChange={markSaved}
              playlist={playlist}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
