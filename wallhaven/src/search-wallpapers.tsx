import { getPreferenceValues, Grid, Icon } from "@raycast/api";
import { useCallback, useRef, useState } from "react";
import { useCachedPromise } from "@raycast/utils";

import { searchWallpapers } from "./api";
import {
  applySelection,
  CATEGORIES,
  DEFAULT_FILTERS,
  describeFilters,
  isCategoryOn,
  PURITIES,
  SORTINGS,
  TOP_RANGES,
  toSearchParams,
  type Filters,
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
   * Apply a change and reset the result set. `update` returns the next state rather than
   * mutating, so a toggle can decline to change anything — which is what the last standing
   * category does — without the caller having to know.
   *
   * Pagination and the random seed reset because both are meaningless once the result set
   * changes underneath them.
   */
  const change = useCallback((update: (previous: Filters) => Filters) => {
    setFilters((previous) => {
      const next = update(previous);
      if (next === previous) return previous;
      allWallpapers.current = [];
      currentPage.current = 1;
      hasMore.current = true;
      seedRef.current = undefined;
      return next;
    });
  }, []);

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

  // `value`, not `storeValue`. Both would show the current choice, but `storeValue` persists a
  // value across sessions and a stale one outranks the live state — the label would then lie
  // about what is being searched for.
  //
  // The value is a snapshot of the whole selection rather than one item's value, so reopening
  // the menu shows exactly what is in effect. The dropdown still shows one item as chosen, and
  // the checkmarks below carry the rest.
  const summary = describeFilters(filters);
  const mark = (on: boolean) => (on ? Icon.Checkmark : undefined);

  const onChange = (selected: string) => change((previous) => applySelection(previous, selected));

  // The dropdown's selected item is a snapshot of the whole selection, so reopening the menu
  // shows what is in effect rather than whichever item was last clicked. One item still shows
  // as chosen; the checkmarks carry the rest.
  const snapshot = `general:${isCategoryOn(filters, "100")} anime:${isCategoryOn(filters, "010")} people:${isCategoryOn(filters, "001")} ${filters.purity} ${filters.sorting}${
    filters.sorting === "toplist" ? ` ${filters.topRange}` : ""
  }`;

  // ONE dropdown. Vicinae keeps a single search-bar accessory:
  //
  //   grid-model.hpp:55   using GridSearchBarAccessory = std::variant<DropdownModel>;
  //   grid-model.hpp:77   std::optional<GridSearchBarAccessory> searchBarAccessory;
  //   model-deser.cpp:934  m.searchBarAccessory = toDropdownModel(...);   // assignment
  //   extension-view-host.cpp:215-219   one updateDropdown(dropdown)
  //
  // A second `Grid.Dropdown` overwrites the first rather than appearing beside it, and
  // `test/accessory.test.ts` counts ours to keep it that way. Sections are how one dropdown
  // holds several groups.
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
        <Grid.Dropdown
          tooltip={`Filters${summary ? ` — ${summary}` : ""}`}
          value={snapshot}
          onChange={onChange}
        >
          {/* Independent checkboxes, as on wallhaven.cc: unchecking Anime leaves General on.
              The dropdown's own selected item cannot express that — one item is selected at a
              time — so each carries a checkmark and selecting it toggles its bit. */}
          <Grid.Dropdown.Section title="Categories">
            {CATEGORIES.map((category) => (
              <Grid.Dropdown.Item
                key={category.bit}
                title={category.title}
                value={`cat:${category.bit}`}
                icon={mark(isCategoryOn(filters, category.bit))}
              />
            ))}
          </Grid.Dropdown.Section>

          {/* Hidden under safe search: with sfwOnly on, purity is forced to 100 and a control
              that does nothing would be a lie. NSFW needs an account, so the third option
              appears only once a key is present. */}
          {!sfwOnly && (
            <Grid.Dropdown.Section title="Content">
              {PURITIES.filter((item) => item.value !== "111" || hasApiKey).map((item) => (
                <Grid.Dropdown.Item
                  key={item.value}
                  title={item.title}
                  value={`pur:${item.value}`}
                  icon={mark(item.value === filters.purity)}
                />
              ))}
            </Grid.Dropdown.Section>
          )}

          {/* Exclusive: one sort mode at a time, so the checkmark is the selection itself. */}
          <Grid.Dropdown.Section title="Sort by">
            {SORTINGS.map((item) => (
              <Grid.Dropdown.Item
                key={item.value}
                title={item.title}
                value={`sort:${item.value}`}
                icon={mark(item.value === filters.sorting)}
              />
            ))}
          </Grid.Dropdown.Section>

          {/* Only meaningful for toplist. Hidden otherwise rather than offered and ignored —
              `buildSearchQuery` drops it too. */}
          {filters.sorting === "toplist" && (
            <Grid.Dropdown.Section title="Top range">
              {TOP_RANGES.map((item) => (
                <Grid.Dropdown.Item
                  key={item.value}
                  title={item.title}
                  value={`range:${item.value}`}
                  icon={mark(item.value === filters.topRange)}
                />
              ))}
            </Grid.Dropdown.Section>
          )}
        </Grid.Dropdown>
      }
    />
  );
}