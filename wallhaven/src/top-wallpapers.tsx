import { getPreferenceValues, Grid, Icon } from "@raycast/api";
import { useCallback, useRef, useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import { searchWallpapers } from "./api";
import { DEFAULT_FILTERS, TOP_RANGES, withFilter, type TopRangeValue } from "./filters";
import { Wallpaper } from "./types";
import { WallpaperGrid } from "./components/WallpaperGrid";

export default function TopWallpapers() {
  const { sfwOnly } = getPreferenceValues<Preferences>();
  // The range lives in the same `filters` shape as the search command's, so a toplist picked
  // from Search Wallpapers carries the same value. toplist is fixed here — that is what the
  // command is — so only the range is exposed.
  const [topRange, setTopRange] = useState<TopRangeValue>(DEFAULT_FILTERS.topRange);
  const allWallpapers = useRef<Wallpaper[]>([]);
  const currentPage = useRef(1);
  const hasMore = useRef(true);

  const { isLoading, revalidate } = useCachedPromise(
    async (range: TopRangeValue, page: number) => {
      const result = await searchWallpapers({
        ...withFilter(DEFAULT_FILTERS, "sorting", "toplist"),
        ...withFilter(DEFAULT_FILTERS, "topRange", range),
        purity: sfwOnly ? DEFAULT_FILTERS.purity : undefined,
        page,
      });
      hasMore.current = result.meta.current_page < result.meta.last_page;
      if (page === 1) {
        allWallpapers.current = result.data;
      } else {
        allWallpapers.current = [...allWallpapers.current, ...result.data];
      }
      return allWallpapers.current;
    },
    [topRange, currentPage.current],
    { keepPreviousData: true },
  );

  const onLoadMore = useCallback(() => {
    if (hasMore.current && !isLoading) {
      currentPage.current += 1;
      revalidate();
    }
  }, [isLoading, revalidate]);

  const dropdown = (
    <Grid.Dropdown
      tooltip="Time Range"
      value={topRange}
      onChange={(value) => {
        setTopRange(value as TopRangeValue);
        allWallpapers.current = [];
        currentPage.current = 1;
        hasMore.current = true;
      }}
    >
      {TOP_RANGES.map((item) => (
        <Grid.Dropdown.Item
          key={item.value}
          title={item.title}
          value={item.value}
          icon={item.value === topRange ? Icon.Checkmark : undefined}
        />
      ))}
    </Grid.Dropdown>
  );

  return (
    <WallpaperGrid
      wallpapers={allWallpapers.current}
      isLoading={isLoading}
      hasMore={hasMore.current}
      onLoadMore={onLoadMore}
      searchBarPlaceholder="Top wallpapers"
      searchBarAccessory={dropdown}
    />
  );
}
