import assert from "node:assert/strict";

import {
  displayName,
  filterPlayers,
  formatTime,
  parseMetadata,
  playerSubtitle,
  type PlayerInfo,
} from "../src/utils/playerctl.ts";
import { CARD_W, COVER_H, INFO_H, cardToMarkdown, coverCard, fit, imageSize, infoCard } from "../src/lib/cards.ts";

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

/** Headers laid out as the formats define them (PNG IHDR, JPEG SOF0), not as the parser reads them. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
}

/**
 * `MdImage.qml` caps a markdown image at `min(200, 0.7 × pane)` and sizes it from
 * the URL, not from the SVG header (`markdown-model.cpp` → `parseImageSize`). A
 * card without the query is drawn at the SVG's own width and the pane falls
 * apart, so the query is the contract.
 */
check("a card carries the box the pane must give it", () => {
  const markdown = cardToMarkdown(coverCard("", undefined), COVER_H);
  const [, query, rest] = /^!\[\]\(data:image\/svg\+xml(\?[^,#]*)#x,(.*)$/.exec(markdown) ?? [];
  const search = new URLSearchParams(query);
  assert.equal(Number(search.get("raycast-width")), CARD_W);
  assert.equal(Number(search.get("raycast-height")), COVER_H);
  assert.ok(rest && rest.length > 100, "the SVG payload follows the comma");
  assert.ok(!rest.includes("raycast"), "the query is not part of the SVG");
});

check("two cards stay under the image cap that made a single one leave a gap", () => {
  assert.ok(COVER_H <= 200 && INFO_H <= 200, "MdImage.qml clamps every image to 200 px");
  // The pane shows 370 px at a 772×472 window; two cards and the paragraph gap fill it.
  assert.ok(COVER_H + INFO_H + 8 >= 360, "the pair has to fill the pane");
});

check("the cover's shape is read from its bytes", () => {
  assert.deepEqual(imageSize(jpeg(544, 544)), { width: 544, height: 544 });
  assert.deepEqual(imageSize(jpeg(480, 360)), { width: 480, height: 360 });
  assert.deepEqual(imageSize(png(1280, 720)), { width: 1280, height: 720 });
  assert.equal(imageSize(Uint8Array.from([0x00, 0x01, 0x02])), undefined, "unknown bytes are not guessed at");
});

check("the card frames the cover without changing its shape", () => {
  const frame = (width: number, height: number) => {
    const card = coverCard("data:image/jpeg;base64,AA==", { width, height });
    // The dimmed backdrop carries an `opacity`; the framed cover is the image without one.
    const [art] = [...card.matchAll(/<image x="[\d.-]+" y="[\d.-]+" width="([\d.]+)" height="([\d.]+)" href=/g)];
    return { w: Number(art?.[1]), h: Number(art?.[2]) };
  };

  for (const [width, height] of [[544, 544], [900, 1200], [1280, 720]] as const) {
    const art = frame(width, height);
    assert.ok(Math.abs(art.w / art.h - width / height) < 0.01, `drawn at ${art.w}×${art.h}, not ${width}:${height}`);
    assert.ok(art.w <= CARD_W - 36 && art.h <= COVER_H - 36, "the frame stays inside the card");
  }
});

check("a card without a readable picture is still a card", () => {
  const card = coverCard("", undefined);
  assert.match(card, /viewBox="0 0 420 180"/);
  assert.equal(/<image /.test(card), false, "no picture to draw");
});

check("the info card draws the title, the divider and every fact", () => {
  const card = infoCard("AC/DC & <Friends>", "Пехотинец", [
    ["Status", "Playing"],
    ["Position", "2:38 / 4:16"],
  ]);
  assert.match(card, /AC\/DC &amp; &lt;Friends&gt;/, "markup in a title is escaped, not drawn");
  assert.match(card, /height="1" fill="#e6e7ea" opacity="0.14"/, "the hairline under the title");
  assert.match(card, /STATUS/);
  assert.match(card, /2:38 \/ 4:16/);
});

check("a long value is cut with an ellipsis, not overdrawn", () => {
  assert.equal(fit("short", 10), "short");
  assert.equal(fit("x".repeat(40), 10), `${"x".repeat(9)}…`);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
