import { getPreferenceValues, Grid, Icon } from "@raycast/api";
import { useCallback, useRef, useState } from "react";
import { useCachedPromise } from "@raycast/utils";

import { searchWallpapers } from "./api";
import {
  CATEGORIES,
  DEFAULT_FILTERS,
  describeFilters,
  PURITIES,
  SORTINGS,
  TOP_RANGES,
  toSearchParams,
  withFilter,
  type CategoryValue,
  type Filters,
  type PurityValue,
  type SortingValue,
  type TopRangeValue,
} from "./filters";
import { Wallpaper } from "./types";
import { WallpaperGrid } from "./components/WallpaperGrid";

export default function SearchWallpapers() {
  const { apiKey, sfwOnly } = getPreferenceValues<Preferences>();
  const hasApiKey = Boolean(apiKey);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const allWallpapers = useRef<Wallpaper[]>([]);
  const currentPage = useRef(1);
  const hasMore = useRef(true);
  const seedRef = useRef<string | undefined>(undefined);

  const { isLoading, revalidate } = useCachedPromise(
    async (query: string, current: Filters, page: number) => {
      const result = await searchWallpapers(
        toSearchParams(current, { query, sfwOnly: Boolean(sfwOnly), page, seed: seedRef.current }),
      );
      if (current.sorting === "random" && result.meta.seed) {
        seedRef.current = result.meta.seed;
      }
      hasMore.current = result.meta.current_page < result.meta.last_page;
      allWallpapers.current =
        page === 1 ? result.data : [...allWallpapers.current, ...result.data];
      return allWallpapers.current;
    },
    [searchText, filters, currentPage.current],
    { keepPreviousData: true },
  );

  /**
   * One field changes; the others stay exactly as they were. This is the fix for "I can only
   * set a filter or a sort mode": each control drives its own key, so picking a category
   * cannot clear the sort mode. Upstream had a single dropdown whose one `storeValue` slot
   * made every new choice look like it replaced the last one, even though the API takes them
   * together.
   *
   * Pagination and the random seed reset because both are meaningless once the result set
   * changes underneath them.
   */
  const changeFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((previous) => withFilter(previous, key, value));
      allWallpapers.current = [];
      currentPage.current = 1;
      hasMore.current = true;
      seedRef.current = undefined;
    },
    [],
  );

  const onLoadMore = useCallback(() => {
    if (hasMore.current && !isLoading) {
      currentPage.current += 1;
      revalidate();
    }
  }, [isLoading, revalidate]);

  const onSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
    allWallpapers.current = [];
    currentPage.current = 1;
    hasMore.current = true;
    seedRef.current = undefined;
  }, []);

  // `value` on each dropdown, not `storeValue`. Both would show the current choice, but
  // `storeValue` persists one value per dropdown and a stale value from an earlier session
  // outranks the state above — the display would lie about what is being searched for.
  const check = (active: boolean) => (active ? Icon.Checkmark : undefined);
  const summary = describeFilters(filters);

  return (
    <WallpaperGrid
      wallpapers={allWallpapers.current}
      isLoading={isLoading}
      hasMore={hasMore.current}
      onLoadMore={onLoadMore}
      searchBarPlaceholder="Search wallpapers..."
      throttle
      onSearchTextChange={onSearchTextChange}
      searchBarAccessory={
        <>
          <Grid.Dropdown
            tooltip={`Category${summary ? ` — ${summary}` : ""}`}
            value={filters.categories}
            onChange={(value) => changeFilter("categories", value as CategoryValue)}
          >
            {CATEGORIES.map((item) => (
              <Grid.Dropdown.Item
                key={item.value}
                title={item.title}
                value={item.value}
                icon={check(item.value === filters.categories)}
              />
            ))}
          </Grid.Dropdown>

          {/* Hidden under safe search: with sfwOnly on, purity is forced to 100 and a
              control that does nothing would be a lie. NSFW needs an account, so the third
              option only appears once a key is present. */}
          {!sfwOnly && (
            <Grid.Dropdown
              tooltip="Content"
              value={filters.purity}
              onChange={(value) => changeFilter("purity", value as PurityValue)}
            >
              {PURITIES.filter((item) => item.value !== "111" || hasApiKey).map((item) => (
                <Grid.Dropdown.Item
                  key={item.value}
                  title={item.title}
                  value={item.value}
                  icon={check(item.value === filters.purity)}
                />
              ))}
            </Grid.Dropdown>
          )}

          <Grid.Dropdown
            tooltip="Sort by"
            value={filters.sorting}
            onChange={(value) => changeFilter("sorting", value as SortingValue)}
          >
            {SORTINGS.map((item) => (
              <Grid.Dropdown.Item
                key={item.value}
                title={item.title}
                value={item.value}
                icon={check(item.value === filters.sorting)}
              />
            ))}
          </Grid.Dropdown>

          {/* Only meaningful for toplist. Hidden otherwise rather than offered and ignored —
              `buildSearchQuery` drops it too. */}
          {filters.sorting === "toplist" && (
            <Grid.Dropdown
              tooltip="Top range"
              value={filters.topRange}
              onChange={(value) => changeFilter("topRange", value as TopRangeValue)}
            >
              {TOP_RANGES.map((item) => (
                <Grid.Dropdown.Item
                  key={item.value}
                  title={item.title}
                  value={item.value}
                  icon={check(item.value === filters.topRange)}
                />
              ))}
            </Grid.Dropdown>
          )}
        </>
      }
    />
  );
}