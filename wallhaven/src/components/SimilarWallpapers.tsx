import { useCallback, useRef } from "react";
import { showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { searchWallpapers } from "../api";
import { Wallpaper } from "../types";
import { WallpaperGrid } from "./WallpaperGrid";

export function SimilarWallpapers({ wallpaperId }: { wallpaperId: string }) {
  const allWallpapers = useRef<Wallpaper[]>([]);
  const currentPage = useRef(1);
  const hasMore = useRef(true);

  const { isLoading, revalidate } = useCachedPromise(
    async (id: string, page: number) => {
      try {
        const result = await searchWallpapers({
          q: `like:${id}`,
          page,
        });
        hasMore.current = result.meta.current_page < result.meta.last_page;
        if (page === 1) {
          allWallpapers.current = result.data;
        } else {
          allWallpapers.current = [...allWallpapers.current, ...result.data];
        }
        return allWallpapers.current;
      } catch (error) {
        // Measured: `?q=like:<id>` is answered with a 403 and a Cloudflare challenge
        // while the same API answers plain searches. An unhandled rejection here took
        // the whole view down with the launcher window, so the failure is reported and
        // the grid stays up empty.
        hasMore.current = false;
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not load similar wallpapers",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        return allWallpapers.current;
      }
    },
    [wallpaperId, currentPage.current],
    { keepPreviousData: true },
  );

  const onLoadMore = useCallback(() => {
    if (hasMore.current && !isLoading) {
      currentPage.current += 1;
      revalidate();
    }
  }, [isLoading, revalidate]);

  return (
    <WallpaperGrid
      wallpapers={allWallpapers.current}
      isLoading={isLoading}
      hasMore={hasMore.current}
      onLoadMore={onLoadMore}
      navigationTitle="Similar Wallpapers"
      searchBarPlaceholder={`Similar to ${wallpaperId}`}
    />
  );
}
