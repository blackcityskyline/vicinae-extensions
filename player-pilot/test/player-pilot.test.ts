import assert from "node:assert/strict";

import {
  displayName,
  filterPlayers,
  formatTime,
  parseMetadata,
  playerSubtitle,
  type PlayerInfo,
} from "../src/utils/playerctl.ts";
import { CARD_W, COVER_H, ROWS_H, cardToMarkdown, coverCard, factsCard, fit } from "../src/lib/cards.ts";

/**
 * Measured on this machine, 2026-11-16, playerctl v2.4.1:
 *
 *   $ playerctl --player mpv.instance-VdpcXMhj metadata --format \
 *       '{{title}}<US>{{artist}}<US>{{album}}<US>{{mpris:artUrl}}<US>{{mpris:length}}<US>{{position}}'
 *   Боевой путь … часть 2<US>Пехотинец<US><US>https://i1.ytimg.com/vi/IqKQk6O5Djo/hqdefault.jpg<US>7595401000<US>4062066733
 *
 * The album column is empty for a YouTube stream, and both time columns are
 * microseconds — 7595401000 µs is 2:06:35, not 2.4 hours short of a million.
 * `--format` puts the position in the same answer, which is why the second
 * `status` call upstream made is gone.
 */
const SEP = "\u001f";
const MEASURED = [
  "Боевой путь ополчения 2014; Формирование корпуса; Начало СВО;От Славянска до Мариуполя часть 2",
  "Пехотинец",
  "",
  "https://i1.ytimg.com/vi/IqKQk6O5Djo/hqdefault.jpg",
  "7595401000",
  "4062066733",
].join(SEP);

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

check("the measured line parses into the fields it was cut from", () => {
  const metadata = parseMetadata(`${MEASURED}\n`);
  assert.equal(
    metadata?.title,
    "Боевой путь ополчения 2014; Формирование корпуса; Начало СВО;От Славянска до Мариуполя часть 2",
  );
  assert.equal(metadata?.artist, "Пехотинец");
  assert.equal(metadata?.album, undefined, "an empty column is absent, not a zero-width string");
  assert.equal(metadata?.albumArt, "https://i1.ytimg.com/vi/IqKQk6O5Djo/hqdefault.jpg");
  assert.equal(metadata?.length, 7595, "7595401000 µs is 2:06:35, not 7595401000 s");
  assert.equal(metadata?.position, 4062, "4062066733 µs is 1:07:42");
});

check("position comes in microseconds too, and 0 is a value, not missing", () => {
  const metadata = parseMetadata(["Song", "Artist", "Album", "", "215000000", "0"].join(SEP));
  assert.equal(metadata?.length, 215);
  assert.equal(metadata?.position, 0);
});

check("a player with no tags at all is null, not an empty object", () => {
  assert.equal(parseMetadata(""), null);
  assert.equal(parseMetadata("   "), null);
});

check("the bus suffix is not part of the display name", () => {
  assert.equal(displayName("firefox.instance_1_45"), "Firefox");
  assert.equal(displayName("spotify"), "Spotify");
  assert.equal(displayName("chromium.instance9"), "Chromium");
});

check("the filter matches a family, not a substring", () => {
  const names = ["firefox.instance_1_45", "spotify", "spotify.instance_2"];
  assert.deepEqual(filterPlayers(names, ["firefox"]), ["firefox.instance_1_45"]);
  assert.deepEqual(filterPlayers(names, ["spotify"]), ["spotify", "spotify.instance_2"]);
  assert.deepEqual(filterPlayers(names, ["spot"]), [], "'spot' is a prefix, not a family");
  assert.deepEqual(filterPlayers(names, undefined), names, "%any shows everything");
  assert.deepEqual(filterPlayers(names, []), [], "an empty preference is not %any");
});

check("a position reads as minutes and seconds, hours only when there are any", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(7.9), "0:07", "floored, not rounded");
  assert.equal(formatTime(61), "1:01");
  assert.equal(formatTime(3723), "1:02:03");
  assert.equal(formatTime(-5), "0:00");
});

check("the subtitle never ends in a dangling dash", () => {
  const player = (metadata: PlayerInfo["metadata"]): PlayerInfo => ({
    name: "firefox.instance_1_45",
    displayName: "Firefox",
    status: "Playing",
    metadata,
  });

  assert.equal(playerSubtitle(player(parseMetadata(MEASURED))), parseMetadata(MEASURED)?.title);
  assert.equal(playerSubtitle(player({ artist: "Денис Селезнёв" })), "Денис Селезнёв");
  assert.equal(playerSubtitle(player({ artist: "A", album: "B" })), "A – B");
  assert.equal(playerSubtitle(player(null)), "Playing");
});

/**
 * `MdImage.qml` caps a markdown image at `min(200, 0.7 × pane)` and sizes it from
 * the URL, not from the SVG header (`markdown-model.cpp` → `parseImageSize`). A
 * card without the query is drawn at the SVG's own 840 px and the pane falls
 * apart, so the query is the contract.
 */
check("a card carries the box the pane must give it", () => {
  const markdown = cardToMarkdown(coverCard("", "Title", "Artist"), { width: CARD_W, height: COVER_H });
  const [, query, rest] = /^!\[\]\(data:image\/svg\+xml(\?[^,#]*)#x,(.*)$/.exec(markdown) ?? [];
  const search = new URLSearchParams(query);
  assert.equal(Number(search.get("raycast-width")), CARD_W);
  assert.equal(Number(search.get("raycast-height")), COVER_H);
  assert.ok(rest && rest.length > 100, "the SVG payload follows the comma");
  assert.ok(!rest.includes("raycast"), "the query is not part of the SVG");
});

check("two cards stay under the image cap that made a single one leave a gap", () => {
  assert.ok(COVER_H <= 200 && ROWS_H <= 200, "MdImage.qml clamps every image to 200 px");
  // The pane shows 370 px at a 772×472 window; two cards and the paragraph gap fill it.
  assert.ok(COVER_H + ROWS_H + 8 >= 360, "the pair has to fill the pane");
});

check("the facts card opens with the divider the metadata bar used to draw", () => {
  const card = factsCard([["Status", "Playing"]], "dark");
  assert.match(card, /<rect width="\d+" height="2" fill="#e6e7ea" opacity="0.16"\/>/);
  assert.match(card, /PLAYING|Playing/, "values are drawn, not dropped");
});

check("a long value is cut with an ellipsis, not overdrawn", () => {
  assert.equal(fit("short", 10), "short");
  assert.equal(fit("x".repeat(40), 10), `${"x".repeat(9)}…`);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
