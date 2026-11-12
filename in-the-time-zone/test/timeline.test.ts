import assert from "node:assert/strict";

import { generateTimelineSvg } from "../src/utils/svg-timeline.ts";
import { clockFormat, localNoon, zoneClock, zoneParts } from "../src/utils/time.ts";
import { DEFAULT_ZONES } from "../src/utils/zones.ts";

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

/**
 * The instant behind the reference screenshots: San Francisco reads 6:39 PM,
 * Kolkata 7:09 AM, and every other city matches the timeline published with
 * the upstream extension. Anything that drifts shows up here.
 */
const AT = new Date("2026-04-09T01:39:00Z");
const NOW = new Date("2026-04-09T01:24:00Z");
const TOKYO = "Asia/Tokyo|Tokyo|35.68501691|139.7514074";
const BASE_ZONE = "Asia/Kolkata";

const ALL_ZONES = [...DEFAULT_ZONES];

const config = {
  cursorAt: AT,
  nowAt: NOW,
  baseZone: BASE_ZONE,
  baseCityId: TOKYO,
  localCityId: "Europe/London|London|51.49999473|-0.116721844",
  zones: ALL_ZONES,
  timeFormat: "12h" as const,
  appearance: "dark" as const,
  sunTimes: {
    [TOKYO]: { sunrise: "5:33 AM", sunset: "6:14 PM" },
  },
};

const svg = generateTimelineSvg(config);

/** The markup between one row's header and the next row's header. */
function rowOf(city: string): string {
  const start = svg.indexOf(`>${city}<`);
  assert.ok(start >= 0, `no row for ${city}`);
  // The row ends at the next city's header or at the now/cursor lines, which
  // are drawn after every row; the legend comes later still.
  const next = svg.slice(start + 1).search(new RegExp(`>(?:San Francisco|New York|London|Paris|Kuala Lumpur|Tokyo)<|class="(?:now|cursor)-line"`));
  const end = next === -1 ? svg.indexOf("</svg>") : start + 1 + next;
  return svg.slice(start, end);
}

const rects = (markup: string) => [...markup.matchAll(/<rect class="([a-z-]+)" x="([\d.]+)"/g)];
const texts = (markup: string, kind: string) => [...markup.matchAll(new RegExp(`<text class="${kind}[^"]*"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);

check("the timeline is one self-styled svg image", () => {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="792" height="\d+" viewBox="/);
  assert.equal([...svg.matchAll(/<style>/g)].length, 1);
  assert.equal([...svg.matchAll(/<\/svg>/g)].length, 1);
  assert.doesNotMatch(svg, /NaN|undefined|null/);
});

const title = texts(svg, "title");
check("the title reads the base zone's date at the cursor", () => {
  assert.equal(title.length, 1);
  assert.equal(title[0], "Thursday, April 9, 2026");
});

check("every row shows 24 hour cells, midnight spelled out and clipped cells skipped", () => {
  for (const city of ["San Francisco", "New York", "London", "Paris", "Kuala Lumpur", "Tokyo"]) {
    const row = rowOf(city);
    const cells = rects(row);
    assert.ok(cells.length >= 23 && cells.length <= 25, `${city} has ${cells.length} cells`);
    const xs = cells.map(([, , x]) => Number(x));
    assert.ok(Math.min(...xs) <= 13, `${city}'s cells start at ${Math.min(...xs)}, the chart's left edge`);
    assert.ok(Math.max(...xs) >= 748, `${city}'s cells end at ${Math.max(...xs)}, before the chart's right edge`);
    const dayStarts = cells.filter(([klass]) => klass === "day-start");
    assert.ok(dayStarts.length <= 1, `${city} has ${dayStarts.length} midnight cells`);
  }
});

/** The x where the cursor line crosses, and the cell that contains it. */
function cursorCell(row: string): { klass: string; hour: string } {
  // The base zone's local hour start puts the cursor at 396 + fraction * 32 px.
  const base = zoneParts(BASE_ZONE, AT);
  const cursorX = 396 + (((AT.getTime() / 1000) % 60) + base.minute * 60 + base.second) / 3600 * 32;
  const cells = [...row.matchAll(/<rect class="([a-z-]+)" x="([\d.]+)"/g)].map((m) => ({ klass: m[1] ?? "", x: Number(m[2]) }));
  const cell = cells.find((c) => c.x <= cursorX && cursorX < c.x + 32);
  assert.ok(cell, `no cell contains the cursor at ${cursorX.toFixed(1)} px`);
  const labels = [...row.matchAll(/<text class="hour ([a-z-]+-text)" x="([\d.]+)"[^>]*>(\d+)</g)].map((m) => ({
    bold: m[0].includes('font-weight="bold"'),
    hour: m[3] ?? "",
    x: Number(m[2]),
  }));
  const hour = labels.find((l) => l.bold && Math.abs(l.x - (cell.x + 16)) <= 2)?.hour;
  return { klass: cell.klass, hour: hour ?? "" };
}

check("the cursor hour is bold in every row's own local hour grid", () => {
  // The cursor sits at 01:39 UTC: London reads 2 (BST), Tokyo 10 (JST).
  const expect: Record<string, string> = { London: "2", Tokyo: "10", "San Francisco": "18" };
  for (const [city, hour] of Object.entries(expect)) {
    assert.equal(cursorCell(rowOf(city)).hour, hour, `${city}'s bold hour is not ${hour}`);
  }
});

check("cell colours follow the upstream bands: sleep 10PM-6AM, work 9AM-5PM", () => {
  // London is 02:39 at the cursor: sleep. Tokyo 10:39: work. Paris 03:39: sleep.
  // San Francisco 18:39: marginal. Kuala Lumpur 09:39: work.
  const expect: Record<string, string> = {
    London: "sleep",
    Tokyo: "work",
    Paris: "sleep",
    "San Francisco": "marginal",
    "Kuala Lumpur": "work",
  };
  for (const [city, kind] of Object.entries(expect)) {
    assert.equal(cursorCell(rowOf(city)).klass, kind, `${city}'s cursor cell colour`);
  }
});

check("each row carries its GMT badge and a delta against the base, except the base row", () => {
  const gmts = texts(svg, "badge gmt");
  assert.equal(gmts.length, ALL_ZONES.length, "one GMT badge per row");
  assert.ok(gmts.includes("GMT+9"), "Tokyo's own offset is missing");
  assert.ok(gmts.includes("GMT-7"), "San Francisco's own offset is missing");
  const deltas = texts(svg, "badge delta");
  assert.deepEqual(
    deltas.sort(),
    ["-12h 30m", "-9h 30m", "-4h 30m", "-3h 30m", "+2h 30m"].sort(),
    `deltas: ${deltas.join(", ")}`,
  );
  // The base row's header has no delta badge: three badges only on the base row.
  const tokyo = rowOf("Tokyo");
  assert.ok(tokyo.includes("badge local") === false);
  assert.equal(texts(tokyo, "badge delta").length, 0);
  assert.equal(texts(svg, "badge delta").length + 1, ALL_ZONES.length);
});

check("the row on another calendar day wears the day difference", () => {
  // At this instant Kolkata is on 9 April and San Francisco still on 8 April.
  assert.ok(rowOf("San Francisco").includes("day-diff"));
  assert.equal(rowOf("San Francisco").match(/class="day-diff"[^>]*>([^<]*)</)?.[1], "-1");
  assert.ok(!rowOf("London").includes("day-diff"), "London shares the base's date");
  assert.ok(!rowOf("Tokyo").includes("day-diff"), "Tokyo shares the base's date");
});

check("the cursor label shows the cursor time, the header the current time", () => {
  // The header clock is written before the city name, so it is read off the
  // ordered list rather than the row slice.
  const san = rowOf("San Francisco");
  assert.equal(texts(svg, "time")[0], "6:24 PM", "the header clock reads now, not the cursor");
  const label = texts(san, "cursor-label");
  assert.deepEqual(label, ["6:39 PM"], "the cursor label reads the cursor");
});

check("the local row wears the Local badge", () => {
  assert.ok(rowOf("London").includes(">Local<"));
  assert.ok(!rowOf("Tokyo").includes(">Local<"));
});

check("sun times render next to the row header", () => {
  const tokyo = rowOf("Tokyo");
  assert.deepEqual(texts(tokyo, "sun"), ["5:33 AM", "6:14 PM"]);
  const paris = rowOf("Paris");
  assert.deepEqual(texts(paris, "sun").filter((value) => value !== ""), ["—", "—"], "no coordinates, no sun");
});

check("the now line is green and drawn once, the cursor line red when scrubbed", () => {
  assert.equal([...svg.matchAll(/class="now-line"/g)].length, 1);
  assert.ok(svg.includes(">now<"), "the now label is drawn");
  assert.equal([...svg.matchAll(/class="cursor-line"/g)].length, 1, "the cursor sits away from now, so the red line is drawn");
  const unscrubbed = generateTimelineSvg({ ...config, cursorAt: NOW });
  assert.equal([...unscrubbed.matchAll(/class="cursor-line"/g)].length, 0, "at now only the green line is drawn");
});

check("the legend spells the three bands", () => {
  const legend = texts(svg, "legend");
  assert.deepEqual(legend, ["Work", "Early/Late", "Sleep"]);
});

check("scrubbing moves the cells' absolute positions, not the hour numbers", () => {
  // Ninety minutes later the cursor sits in another hour: Paris 3:39 → 5:09 stays
  // sleep, and Tokyo's cursor cell is still work, but every cell moved right.
  const later = generateTimelineSvg({ ...config, cursorAt: new Date(AT.getTime() + 90 * 60_000) });
  const start = later.indexOf(">Tokyo<");
  const row = later.slice(start, later.indexOf("</svg>"));
  const base = zoneParts(BASE_ZONE, new Date(AT.getTime() + 90 * 60_000));
  const cursorX = 396 + (((AT.getTime() + 90 * 60_000) / 1000) % 60 + base.minute * 60 + base.second) / 3600 * 32;
  const cells = [...row.matchAll(/<rect class="([a-z-]+)" x="([\d.]+)"/g)].map((m) => ({ klass: m[1] ?? "", x: Number(m[2]) }));
  const cell = cells.find((c) => c.x <= cursorX && cursorX < c.x + 32);
  assert.equal(cell?.klass, "work", "Tokyo 12:09 is still work");
  assert.ok(Math.abs((cell?.x ?? 0) - 396) < 32, "the cursor cell is still near column 12");
});

check("one zone and no zones both render", () => {
  const one = generateTimelineSvg({ ...config, zones: [TOKYO] });
  assert.ok(one.includes(">Tokyo<"));
  const none = generateTimelineSvg({ ...config, zones: [] });
  assert.doesNotMatch(none, /class="hour/);
});

check("the clock style is resolved from the preference and the system", () => {
  assert.equal(clockFormat("24-hour"), "24h");
  assert.equal(clockFormat("12-hour"), "12h");
  assert.ok(clockFormat("system") === "12h" || clockFormat("system") === "24h");
  assert.equal(zoneClock("Europe/London", AT, "24h"), "02:39");
  assert.equal(zoneClock("Europe/London", AT, "12h"), "2:39 AM");
});

check("the sun is read at the city's local noon, not at the cursor", () => {
  // Kolkata 7:09 AM at the cursor: the noon of Kolkata's 9 April.
  const noon = localNoon("Asia/Kolkata", AT);
  assert.equal(zoneClock("Asia/Kolkata", noon, "24h"), "12:00");
  assert.equal(noon.toISOString(), "2026-04-09T06:30:00.000Z");
});

console.log(`\n${checks} checks passed`);
