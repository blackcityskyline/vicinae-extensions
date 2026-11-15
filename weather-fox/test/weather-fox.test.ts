import assert from "node:assert/strict";

import {
  degreesToCompass,
  filterGeoResults,
  fmt,
  formatPlace,
  formatPrecip,
  formatSnow,
  geocodeName,
  usAqiInfo,
  type GeoResult,
} from "../src/lib/api.ts";
import { labelFor } from "../src/lib/palettes.ts";
import { escapeMarkdown, escapeXml, markdownAlt } from "../src/lib/text.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

const place = (over: Partial<GeoResult>): GeoResult => ({
  id: 1,
  name: "Springfield",
  latitude: 0,
  longitude: 0,
  ...over,
});

check("usAqiInfo follows the EPA breakpoints", () => {
  // EPA AQI bands: 0-50 Good, 51-100 Moderate, 101-150 USG, 151-200 Unhealthy,
  // 201-300 Very Unhealthy, 301+ Hazardous.
  assert.equal(usAqiInfo(0).label, "Good");
  assert.equal(usAqiInfo(50).label, "Good");
  assert.equal(usAqiInfo(51).label, "Moderate");
  assert.equal(usAqiInfo(100).label, "Moderate");
  assert.equal(usAqiInfo(101).label, "Unhealthy for Sensitive Groups");
  assert.equal(usAqiInfo(150).label, "Unhealthy for Sensitive Groups");
  assert.equal(usAqiInfo(151).label, "Unhealthy");
  assert.equal(usAqiInfo(200).label, "Unhealthy");
  assert.equal(usAqiInfo(201).label, "Very Unhealthy");
  assert.equal(usAqiInfo(300).label, "Very Unhealthy");
  assert.equal(usAqiInfo(301).label, "Hazardous");
});

check("degreesToCompass maps each 22.5° sector", () => {
  assert.equal(degreesToCompass(0), "N");
  assert.equal(degreesToCompass(22.5), "NNE");
  assert.equal(degreesToCompass(90), "E");
  assert.equal(degreesToCompass(180), "S");
  assert.equal(degreesToCompass(270), "W");
  assert.equal(degreesToCompass(337.5), "NNW");
  // Wrapping without a table offset: 360 is north, 350 rounds to north.
  assert.equal(degreesToCompass(360), "N");
  assert.equal(degreesToCompass(350), "N");
  assert.equal(degreesToCompass(Number.NaN), "—");
});

check("formatPrecip and formatSnow convert to inches at 25.4 and 2.54", () => {
  assert.equal(formatPrecip(25.4, "celsius"), "25.4 mm");
  assert.equal(formatPrecip(25.4, "fahrenheit"), "1.00 in");
  assert.equal(formatPrecip(0, "celsius"), "0.0 mm");
  assert.equal(formatPrecip(null, "celsius"), "—");
  assert.equal(formatSnow(2.54, "celsius"), "2.5 cm");
  assert.equal(formatSnow(2.54, "fahrenheit"), "1.0 in");
  assert.equal(formatSnow(undefined, "celsius"), "—");
});

check("fmt renders missing numbers as an em dash, not NaN", () => {
  assert.equal(fmt(12.6), "13");
  assert.equal(fmt(12.6, "%"), "13%");
  assert.equal(fmt(12.6, "%", false), "12.6%");
  assert.equal(fmt(null, "°"), "—");
  assert.equal(fmt(Number.NaN), "—");
});

check("filterGeoResults narrows by admin, country and initials", () => {
  const results = [
    place({ id: 1, admin1: "New South Wales", country: "Australia", country_code: "AU" }),
    place({ id: 2, admin1: "New Hampshire", country: "United States", country_code: "US" }),
    place({ id: 3, admin1: "New York", country: "United States", country_code: "US" }),
  ];
  assert.deepEqual(
    filterGeoResults(results, "springfield, nsw").results.map((r) => r.id),
    [1],
  );
  assert.deepEqual(
    filterGeoResults(results, "springfield, nh").results.map((r) => r.id),
    [2],
  );
  assert.deepEqual(
    filterGeoResults(results, "springfield, united states").results.map((r) => r.id),
    [2, 3],
  );
  // No comma means no filtering at all.
  assert.equal(filterGeoResults(results, "springfield").relaxed, false);
  assert.equal(filterGeoResults(results, "springfield").results.length, 3);
});

check("filterGeoResults relaxes instead of emptying the list", () => {
  const results = [place({ id: 7, admin1: "Bavaria", country: "Germany" })];
  assert.deepEqual(filterGeoResults(results, "springfield, xx"), { results, relaxed: true });
});

check("geocodeName sends only the part before the first comma", () => {
  assert.equal(geocodeName("  noe valley, san francisco, california "), "noe valley");
  assert.equal(geocodeName("Berlin"), "Berlin");
});

check("formatPlace joins the non-empty name, region and country", () => {
  assert.equal(formatPlace(place({ name: "Minsk", admin1: "Minsk City", country: "Belarus" })), "Minsk, Minsk City, Belarus");
  assert.equal(formatPlace(place({ name: "Monaco", country: "Monaco" })), "Monaco, Monaco");
  assert.equal(formatPlace(place({ name: "Nowhere" })), "Nowhere");
});

check("labelFor reads the WMO weather code table", () => {
  // WMO 4677 codes used by Open-Meteo: 0 clear, 3 overcast, 45 fog, 61 rain,
  // 71 snow, 95 thunderstorm.
  assert.equal(labelFor(0), "Clear Sky");
  assert.equal(labelFor(3), "Overcast");
  assert.equal(labelFor(45), "Fog");
  assert.equal(labelFor(61), "Light Rain");
  assert.equal(labelFor(63), "Rain");
  assert.equal(labelFor(71), "Light Snow");
  assert.equal(labelFor(95), "Thunderstorm");
});

check("escapeXml drops XML-illegal bytes and escapes markup", () => {
  assert.equal(escapeXml('a & b < c > "d" \'e\''), "a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;");
  // A control character would make the whole SVG unparseable.
  assert.equal(escapeXml("Minsk\u0001"), "Minsk");
});

check("escapeMarkdown and markdownAlt neutralise their syntax", () => {
  assert.equal(escapeMarkdown("[x](y) *bold*"), "\\[x\\]\\(y\\) \\*bold\\*");
  assert.equal(markdownAlt("[a]\\b\nc"), "\\[a\\]\\\\b c");
});

console.log(failed === 0 ? `\n${passed} checks passed` : `\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
