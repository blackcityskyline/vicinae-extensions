import assert from "node:assert/strict";

import { cityMapping } from "city-timezones";

import { searchCities } from "../src/utils/cities.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

check("an empty query searches nothing", () => {
  assert.deepEqual(searchCities(""), []);
  assert.deepEqual(searchCities("   "), []);
});

check("the obvious city comes first, not the one that sorts earlier", () => {
  // The dataset holds a San Francisco in Argentina, a London in Ontario and a
  // Tokyo suburb ahead of Tokyo itself, all alphabetical by country. Upstream
  // returns them in that order, so the first hit is the wrong continent.
  assert.match(searchCities("san francisco")[0]?.city ?? "", /^San Francisco$/);
  assert.equal(searchCities("san francisco")[0]?.zone, "America/Los_Angeles");

  assert.equal(searchCities("london")[0]?.zone, "Europe/London");
  assert.equal(searchCities("tokyo")[0]?.zone, "Asia/Tokyo");
});

check("results carry the coordinates the timeline and sunrise need", () => {
  const [sanFrancisco] = searchCities("san francisco");
  assert.equal(typeof sanFrancisco?.lat, "number");
  assert.equal(typeof sanFrancisco?.lng, "number");
  const match = cityMapping.find((c) => c.timezone === "America/Los_Angeles" && c.city === "San Francisco");
  assert.equal(sanFrancisco?.lat, match?.lat);
});

check("a label says where the city is, since the name alone is ambiguous", () => {
  const label = searchCities("san francisco")[0]?.label ?? "";
  assert.match(label, /^San Francisco, California, /);
  assert.match(label, /United States/);
});

check("UTC is offered without a search of the dataset", () => {
  const utc = searchCities("utc");
  assert.equal(utc[0]?.zone, "Etc/UTC");
  assert.equal(utc[0]?.city, "UTC");
});

check("a query matches on country and province as well as city", () => {
  const results = searchCities("japan");
  assert.ok(results.length > 0, "expected matches for a country name");
  assert.ok(results.every((result) => result.zone.length > 0));
});

check("the limit is honoured", () => {
  assert.ok(searchCities("san", 5).length <= 5);
  // The command asks for ten; the dataset holds far more matches than that for
  // a one-letter query, so a limit that is not applied shows up here.
  assert.ok(searchCities("a", 10).length <= 10);
  assert.ok(searchCities("a").length > 10, "the default limit should be larger than ten");
});

check("a query that matches nothing returns nothing rather than everything", () => {
  assert.deepEqual(searchCities("qqqzzzxyz"), []);
});

check("ids round-trip through the parser", async () => {
  const { parseZone } = await import("../src/utils/zones.ts");
  for (const result of searchCities("paris")) {
    const parsed = parseZone(result.id);
    assert.equal(parsed.zone, result.zone);
    assert.equal(parsed.city, result.city);
    assert.equal(parsed.lat, result.lat);
    assert.equal(parsed.lng, result.lng);
  }
});
