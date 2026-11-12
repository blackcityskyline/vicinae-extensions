import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";

import { podcastEpisodes } from "~/api/podcasts";
import type { MusicConfig } from "~/api/player";
import { EpisodeRow } from "~/components/rows";
import { escapeMarkdown } from "~/utils/monochrome";
import { podcastUrl, type Episode, type Podcast } from "~/utils/podcasts";

/** A podcast page: the feed's own episodes, 50 at a time, straight from PodcastIndex. */
export function PodcastView({ podcast, config }: { podcast: Podcast; config: MusicConfig }) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEpisodes(null);
    setProblem(null);

    podcastEpisodes(podcast.id, config)
      .then((page) => {
        if (cancelled) return;
        setEpisodes(page.episodes);
        setHasMore(page.hasMore);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [podcast.id, config]);

  const loadMore = async (): Promise<void> => {
    if (episodes === null || loading) return;
    setLoading(true);
    try {
      const page = await podcastEpisodes(podcast.id, config, episodes.length);
      setEpisodes([...episodes, ...page.episodes]);
      setHasMore(page.hasMore);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <List
      navigationTitle={podcast.title}
      isLoading={(episodes === null && problem === null) || loading}
      isShowingDetail
      searchBarPlaceholder="Filter these episodes"
      pagination={{ hasMore, onLoadMore: () => void loadMore() }}
    >
      {problem ? <List.EmptyView icon={Icon.Warning} title="Could not load the podcast" description={problem} /> : null}

      <List.Section title={podcast.title}>
        <List.Item
          title={podcast.title}
          subtitle={[podcast.author, podcast.episodeCount === undefined ? undefined : `${podcast.episodeCount} episodes`]
            .filter((part) => part !== undefined && part !== "")
            .join(" · ")}
          icon={podcast.artwork ? { source: podcast.artwork } : Icon.Microphone}
          detail={
            <List.Item.Detail
              markdown={[
                podcast.artwork ? `![](${podcast.artwork})` : "",
                `**${escapeMarkdown(podcast.title)}**`,
                podcast.description ? escapeMarkdown(podcast.description) : "",
              ]
                .filter((part) => part !== "")
                .join("\n\n")}
            />
          }
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open in Monochrome"
                url={podcastUrl(podcast.id)}
                shortcut="open"
              />
              <Action.CopyToClipboard title="Copy Link" content={podcastUrl(podcast.id)} shortcut="copy" />
            </ActionPanel>
          }
        />
      </List.Section>

      {episodes !== null && episodes.length > 0 ? (
        <List.Section title="Episodes">
          {episodes.map((episode) => (
            <EpisodeRow key={episode.id} episode={episode} config={config} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
