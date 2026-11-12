import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readLibrary, savePlaylist, forgetPlaylist } from "~/api/library";
import { fetchEntries } from "~/api/ytdlp";
import type { Config, Entry } from "~/types";
import { messageOf } from "~/utils/errors";
import { playlistIdOf } from "~/utils/state";

export type Listing = {
  /** yt-dlp's title for the page, used as yt-x's playlist name. */
  title: string | undefined;
  entries: Entry[];
  problem: string | null;
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
};

/**
 * One page of a yt-dlp listing, with yt-x's page size and Next page. A page
 * that comes back full may have another one behind it.
 */
export function useListing(config: Config, target: string | undefined, extraOpts: string[] = []): Listing {
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(target));
  const [hasMore, setHasMore] = useState(false);

  const page = useRef(0);
  const busy = useRef(false);
  const generation = useRef(0);
  const extraKey = extraOpts.join("\u0000");

  const load = useCallback(
    async (next: number, append: boolean): Promise<void> => {
      if (!target || busy.current) return;

      const run = generation.current;
      busy.current = true;
      setIsLoading(true);

      try {
        const found = await fetchEntries(target, config, {
          start: (next - 1) * config.perPage + 1,
          end: next * config.perPage,
          extraOpts,
        });
        if (run !== generation.current) return;

        page.current = next;
        setTitle(found.title);
        setEntries((previous) => (append ? [...previous, ...found.entries] : found.entries));
        setProblem(null);
        setHasMore(found.entries.length === config.perPage);
      } catch (error) {
        if (run !== generation.current) return;
        setProblem(messageOf(error));
        setEntries((previous) => (append ? previous : []));
        setHasMore(false);
      } finally {
        if (run === generation.current) {
          setIsLoading(false);
          busy.current = false;
        }
      }
    },
    // the joined options are the identity that matters
    [config, target, extraKey],
  );

  useEffect(() => {
    generation.current += 1;
    page.current = 0;
    busy.current = false;

    if (!target) {
      setTitle(undefined);
      setEntries([]);
      setProblem(null);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    setTitle(undefined);
    setEntries([]);
    setProblem(null);
    setIsLoading(true);
    setHasMore(false);
    void load(1, false);
  }, [load, target]);

  const loadMore = useCallback(async () => {
    await load(page.current + 1, true);
  }, [load]);

  return { title, entries, problem, isLoading, hasMore, loadMore };
}

export type PlaylistActions = {
  title: string;
  url: string;
  saved: boolean;
  save: () => Promise<void>;
  forget: () => Promise<void>;
};

/** yt-x's Save Playlist / UnSave Playlist, kept in sync while a view is open. */
export function usePlaylistActions(config: Config) {
  const [urls, setUrls] = useState<ReadonlySet<string>>(
    () => new Set(readLibrary(config.configDir).library.playlists.map((playlist) => playlist.url)),
  );

  return useMemo(() => {
    return (title: string, url: string): PlaylistActions => ({
      title,
      url,
      saved: urls.has(url),
      save: async () => {
        savePlaylist({ id: playlistIdOf(url), name: title, url }, config.configDir);
        setUrls((previous) => new Set([...previous, url]));
      },
      forget: async () => {
        forgetPlaylist(url, config.configDir);
        setUrls((previous) => {
          const next = new Set(previous);
          next.delete(url);
          return next;
        });
      },
    });
  }, [config, urls]);
}
