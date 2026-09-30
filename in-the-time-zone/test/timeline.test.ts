import assert from "node:assert/strict";

import { renderTimeline } from "../src/utils/timeline.ts";
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
 * Emoji occupy two cells in a code block and everything else occupies one. This
 * is written out here rather than imported so the width assertions below do not
 * agree with the renderer by construction.
 */
function width(line: string): number {
  let total = 0;
  for (const character of line) {
    total += (character.codePointAt(0) ?? 0) > 0x1f000 ? 2 : 1;
  }
  return total;
}

const BLOCKS = /[🟩🟨🟥]/gu;
const ALL_ZONES = [...DEFAULT_ZONES];

/**
 * The instant behind the reference screenshots: San Francisco reads 6:39 PM,
 * Kolkata 7:09 AM, and every other city matches the timeline published with
 * the upstream extension. Anything that drifts shows up here.
 */
const AT = new Date("2026-04-09T01:39:00Z");
const BASE = "Asia/Kolkata";

const markdown = renderTimeline({ at: AT, zones: ALL_ZONES, base: BASE });
const lines = markdown.split("\n");

function cityLine(city: string): string {
  const line = lines.find((candidate) => candidate.startsWith(city));
  assert.ok(line, `no line for ${city} in:\n${markdown}`);
  return line as string;
}

function blockLine(city: string): string {
  const index = lines.findIndex((candidate) => candidate.startsWith(city));
  assert.ok(index >= 0, `no line for ${city}`);
  return lines[index + 1] ?? "";
}

/** The block the marker wraps. It is a surrogate pair, so two code units. */
function markedBlock(blockRow: string): string {
  return blockRow.slice(25, 27);
}

check("the markdown is one fenced code block", () => {
  const fences = lines.filter((line) => line.trim() === "```");
  assert.equal(fences.length, 2, "expected exactly one opening and one closing fence");
  assert.equal(lines[0]?.trim(), "```");
  assert.equal(lines[lines.length - 1]?.trim(), "```");
});

check("every city is on the reference clock, in the reference order", () => {
  assert.match(cityLine("San Francisco"), /6:39 PM/);
  assert.match(cityLine("New York"), /9:39 PM/);
  assert.match(cityLine("London"), /2:39 AM/);
  assert.match(cityLine("Paris"), /3:39 AM/);
  assert.match(cityLine("Kuala Lumpur"), /9:39 AM/);
  assert.match(cityLine("Tokyo"), /10:39 AM/);

  const order = lines.filter((line) => /^San Francisco|^New York|^London|^Paris|^Kuala Lumpur|^Tokyo/.test(line));
  assert.deepEqual(
    order.map((line) => line.split(" ")[0]),
    ["San", "New", "London", "Paris", "Kuala", "Tokyo"],
  );
});

check("deltas match the reference timeline", () => {
  assert.match(cityLine("San Francisco"), /-12h 30m$/);
  assert.match(cityLine("New York"), /-9h 30m$/);
  assert.match(cityLine("London"), /-4h 30m$/);
  assert.match(cityLine("Paris"), /-3h 30m$/);
  assert.match(cityLine("Kuala Lumpur"), /\+2h 30m$/);
  assert.match(cityLine("Tokyo"), /\+3h 30m$/);
});

check("only the cities on another date carry a day marker", () => {
  // At this instant Kolkata is on 9 April and San Francisco still on 8 April.
  assert.match(cityLine("San Francisco"), /6:39 PM -1/);
  assert.match(cityLine("New York"), /9:39 PM -1/);
  assert.doesNotMatch(cityLine("London"), /2:39 AM [-+]\d/);
  assert.doesNotMatch(cityLine("Tokyo"), /10:39 AM [-+]\d/);
});

check("each city gets a full day of blocks with the marker at midday", () => {
  for (const id of ALL_ZONES) {
    const city = id.split("|")[1] ?? "";
    const blocks = blockLine(city);
    assert.equal(blocks.match(BLOCKS)?.length, 24, `${city} does not have 24 blocks:\n${blocks}`);
    // The marker wraps the twelfth block, which is the city-local noon.
    assert.equal(blocks.slice(24, 25), "|", `${city} marker is not at cell 24:\n${blocks}`);
  }
});

check("the block colours follow the legend", () => {
  // Block twelve is the city-local noon the marker sits on. At this instant San
  // Francisco is 11:39, Tokyo 10:39 and London 02:39.
  assert.equal(markedBlock(blockLine("San Francisco")), "🟨");
  assert.equal(markedBlock(blockLine("Tokyo")), "🟩");
  assert.equal(markedBlock(blockLine("London")), "🟥");
});

check("the NOW marker sits over the same column on every line", () => {
  const markerColumns = ALL_ZONES.map((id) => {
    const blocks = blockLine(id.split("|")[1] ?? "");
    const column = width(blocks.slice(0, blocks.indexOf("|")));
    assert.ok(column > 0, "no marker found");
    return column;
  });
  assert.equal(new Set(markerColumns).size, 1, `markers are ragged: ${markerColumns.join(", ")}`);

  const nowLine = lines.find((line) => line.includes("NOW")) ?? "";
  const nowStart = width(nowLine.slice(0, nowLine.indexOf("NOW")));
  const nowCentre = nowStart + 1.5;
  const markerCentre = (markerColumns[0] ?? 0) + 1;
  assert.ok(
    Math.abs(nowCentre - markerCentre) <= 1,
    `NOW sits at cell ${nowCentre} and the marker at ${markerCentre}`,
  );
});

check("nothing on any line is wider than the bar", () => {
  // The bar is 24 two-cell blocks plus two bars. Upstream lays its labels out to
  // 67 cells, so at a normal window width its GMT and delta columns are simply
  // clipped away; nothing here may exceed the bar.
  const bar = width(blockLine("Tokyo"));
  assert.equal(bar, 50, "the bar should be 50 cells");
  const widest = Math.max(...lines.map(width));
  assert.ok(widest <= bar, `widest line is ${widest} cells against a ${bar}-cell bar:\n${markdown}`);
  for (const line of lines) {
    assert.ok(!line.includes("\r"), "a line ended in a carriage return, it will wrap");
  }
});

check("every line of the block has the same width", () => {
  const body = lines.slice(1, -1).filter((line) => line.trim().length > 0);
  const widths = new Set(body.map(width));
  assert.equal(widths.size, 1, `lines are ragged, widths: ${[...widths].join(", ")}\n${markdown}`);
});

check("the base city is labelled instead of being given a delta", () => {
  const withBase = renderTimeline({ at: AT, zones: ALL_ZONES, base: "Asia/Tokyo" });
  assert.match(withBase, /\(base\)/);
  assert.doesNotMatch(withBase, /\+3h 30m/, "the base row must not report a delta against itself");
});

check("scrubbing moves every row and nothing else", () => {
  const later = renderTimeline({ at: new Date(AT.getTime() + 90 * 60_000), zones: ALL_ZONES, base: BASE });
  assert.match(later, /8:09 PM -1/, "San Francisco should be 90 minutes later, still a day behind");

  // Ninety minutes in April crosses no daylight saving rule, so every distance
  // from the base has to come out the same. A cached offset would drift here.
  const distances = (markdown: string) => [...markdown.matchAll(/[-+]\d+h \d+m/g)].map((match) => match[0]);
  assert.deepEqual(distances(later), distances(markdown));
});

check("one zone and no zones both render", () => {
  const one = renderTimeline({ at: AT, zones: [ALL_ZONES[0] ?? ""], base: BASE });
  assert.equal(one.match(BLOCKS)?.length, 24);
  const none = renderTimeline({ at: AT, zones: [], base: BASE });
  assert.equal(none.match(BLOCKS), null, "no cities means no blocks");
});
