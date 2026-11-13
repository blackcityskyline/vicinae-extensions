import assert from "node:assert/strict";

import {
  displayName,
  filterPlayers,
  parseMetadata,
  playerSubtitle,
  type PlayerInfo,
} from "../src/utils/playerctl.ts";

/**
 * Measured on this machine, 2026-11-13, playerctl v2.4.1:
 *
 *   $ playerctl --player firefox.instance_1_45 metadata --format \
 *       '{{title}}<US>{{artist}}<US>{{album}}<US>{{mpris:artUrl}}<US>{{mpris:length}}<US>{{position}}'
 *   Разбираем … СССР<US>Денис Селезнëв<US><US>file:///…/9026_1.png<US><US>30
 *
 * The album column is empty for a YouTube stream, there is no `mpris:length`,
 * and `--format` puts the position in the same answer, which is why the second
 * `status` call upstream made is gone.
 */
const SEP = "\u001f";
const MEASURED = [
  "Разбираем Егора Яковлева и Кирилла Назаренко о причинах упадка и разрушения великого СССР",
  "Денис Селезнëв",
  "",
  "file:///home/black/.config/zen/firefox-mpris/9026_1.png",
  "",
  "30",
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
    "Разбираем Егора Яковлева и Кирилла Назаренко о причинах упадка и разрушения великого СССР",
  );
  assert.equal(metadata?.artist, "Денис Селезнëв");
  assert.equal(metadata?.album, undefined, "an empty column is absent, not a zero-width string");
  assert.equal(metadata?.albumArt, "file:///home/black/.config/zen/firefox-mpris/9026_1.png");
  assert.equal(metadata?.length, undefined, "no mpris:length for this stream");
  assert.equal(metadata?.position, 30);
});

check("length arrives in microseconds and a position of 0 is a value, not missing", () => {
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

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
