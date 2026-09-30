import assert from "node:assert/strict";

import { cityMapping } from "city-timezones";

import { DEFAULT_ZONES, coordsOf, parseZone } from "../src/utils/zones.ts";

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

check("a zone id round-trips", () => {
  const id = "Europe/Paris|Paris|48.86669293|2.333335326";
  assert.deepEqual(parseZone(id), {
    zone: "Europe/Paris",
    city: "Paris",
    lat: 48.86669293,
    lng: 2.333335326,
  });
});

check("a city name with spaces or a slash is not split on the wrong character", () => {
  const id = "America/Nuuk|Nuuk|64.183|51.733";
  const parsed = parseZone(id);
  assert.equal(parsed.zone, "America/Nuuk");
  assert.equal(parsed.city, "Nuuk");
  assert.equal(parsed.lat, 64.183);
  // The zone may itself contain slashes; only the first pipe starts the city.
  assert.equal(parseZone("America/Argentina/Buenos_Aires|Buenos Aires|-34.6|-58.4").zone, "America/Argentina/Buenos_Aires");
});

check("coordinates come back as numbers, not as strings", () => {
  const { lat, lng } = coordsOf("Asia/Tokyo|Tokyo|35.68501691|139.7514074");
  assert.equal(typeof lat, "number");
  assert.equal(typeof lng, "number");
  assert.equal(lat, 35.68501691);
});

check("an id with no coordinates reports none instead of guessing", () => {
  const { lat, lng } = coordsOf("Etc/UTC|UTC");
  assert.equal(lat, undefined);
  assert.equal(lng, undefined);
});

check("the default zones all parse and all name a real zone", () => {
  assert.ok(DEFAULT_ZONES.length > 0, "expected at least one default zone");
  for (const id of DEFAULT_ZONES) {
    const parsed = parseZone(id);
    assert.ok(parsed.zone.length > 0, `no zone in ${id}`);
    assert.ok(parsed.city.length > 0, `no city in ${id}`);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.zone }).format(new Date());
    } catch (error) {
      assert.fail(`${parsed.zone} is not an IANA zone: ${error instanceof Error ? error.message : error}`);
    }
  }
});

check("the default zones carry the coordinates of the right city", () => {
  // Upstream looks a city up by zone alone when the exact pair misses, which
  // gives America/Los_Angeles the sunrise of Wallace, Idaho. Coordinates live
  // in the id here, so this pins them to the dataset instead.
  for (const id of DEFAULT_ZONES) {
    const parsed = parseZone(id);
    const match = cityMapping.find((c) => c.timezone === parsed.zone && c.city === parsed.city);
    assert.ok(match, `${parsed.zone}|${parsed.city} is not in city-timezones`);
    assert.equal(match.lat, parsed.lat, `${parsed.city} latitude drifted from the dataset`);
    assert.equal(match.lng, parsed.lng, `${parsed.city} longitude drifted from the dataset`);
  }
});
