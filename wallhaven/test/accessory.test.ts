import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A platform limit, pinned so it cannot regress silently.
 *
 * Vicinae stores the search-bar accessory in ONE field:
 *
 *   grid-model.hpp:55   using GridSearchBarAccessory = std::variant<DropdownModel>;
 *   grid-model.hpp:77   std::optional<GridSearchBarAccessory> searchBarAccessory;
 *
 * and fills it by assignment while walking the grid's children:
 *
 *   model-deser.cpp:934  [&](DropdownModelWire &c) { m.searchBarAccessory = toDropdownModel(...); };
 *
 * There is no `push_back` and no `emplace`. So a second `Grid.Dropdown` overwrites the first,
 * and `extension-view-host.cpp:215-219` renders exactly one — the last child in document order.
 * Three dropdowns do not mean three controls; they mean one, chosen silently.
 *
 * This check counts what we emit, because a second dropdown looks like it works until the user
 * goes looking for the control that is not there.
 */
const source = readFileSync(new URL("../src/search-wallpapers.tsx", import.meta.url), "utf8");
const dropdowns = source.match(/<Grid\.Dropdown[\s>]/g) ?? [];

assert.equal(
  dropdowns.length,
  1,
  `expected exactly 1 Grid.Dropdown, found ${dropdowns.length}. ` +
    `Vicinae keeps only the last one (grid-model.hpp:77 is a single optional, ` +
    `model-deser.cpp:934 assigns rather than appends). Combine into one dropdown with sections.`,
);

console.log("accessory holds exactly one dropdown");
