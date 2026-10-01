import assert from "node:assert/strict";

import { buildSearchQuery } from "../src/api.ts";

/**
 * The bug this file exists for: filters and sorting used to be selectable one at a time,
 * because one `storeValue` dropdown was the only place to pick them and it could only show
 * the last choice. The API has never had that restriction.
 *
 * Measured on wallhaven.cc today:
 *
 *   `?q=nature&categories=100&purity=100&sorting=relevance`  → total 67086
 *   `?q=nature&categories=100&purity=100&sorting=date_added` → total 67086, different ids
 *
 * Same total, different order, so both parameters really do apply together — the
 * restriction was entirely in the picker.
 */

let passed = 0;
let failed = 0;
function check(name: string, body: () => void) {
  try {
    body();
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

const base = { q: "nature", categories: "100", purity: "100" };

check("a category and a sort mode travel in the same request", () => {
  const query = buildSearchQuery({ ...base, sorting: "relevance" });
  assert.equal(query.get("categories"), "100");
  assert.equal(query.get("sorting"), "relevance");
  assert.equal(query.get("q"), "nature");
});

check("every filter and the sort mode coexist", () => {
  const query = buildSearchQuery({ ...base, sorting: "views", purity: "110", categories: "110" });
  assert.equal(query.get("q"), "nature");
  assert.equal(query.get("categories"), "110");
  assert.equal(query.get("purity"), "110");
  assert.equal(query.get("sorting"), "views");
});

check("an empty search term is not sent, so wallhaven does not see q=", () => {
  // `q=` and no `q` are different requests: measured, `?q=` returns total 337562 while
  // omitting `q` entirely with relevance returns a different set. Sending an empty string
  // would silently pin the user to one result set.
  assert.equal(buildSearchQuery({ ...base, q: "" }).has("q"), false);
  assert.equal(buildSearchQuery({ ...base, q: undefined }).has("q"), false);
  assert.equal(buildSearchQuery({ ...base, q: "a" }).get("q"), "a");
});

check("topRange is sent only for toplist", () => {
  // wallhaven ignores it otherwise, and sending a stale one alongside `sorting=views`
  // would be a request that says two contradictory things.
  assert.equal(
    buildSearchQuery({ ...base, sorting: "toplist", topRange: "1M" }).get("topRange"),
    "1M",
  );
  assert.equal(
    buildSearchQuery({ ...base, sorting: "views", topRange: "1M" }).has("topRange"),
    false,
  );
  assert.equal(buildSearchQuery({ ...base, sorting: "toplist" }).has("topRange"), false);
});

check("random keeps its seed so pages do not repeat", () => {
  const seed = buildSearchQuery({ ...base, sorting: "random", seed: "abc123" });
  assert.equal(seed.get("sorting"), "random");
  assert.equal(seed.get("seed"), "abc123");
});

check("nothing is invented when only a term is given", () => {
  const query = buildSearchQuery({ q: "forest" });
  assert.equal(query.toString(), "q=forest");
});

check("page and order are passed through", () => {
  const query = buildSearchQuery({ ...base, sorting: "favorites", order: "asc", page: 3 });
  assert.equal(query.get("page"), "3");
  assert.equal(query.get("order"), "asc");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);