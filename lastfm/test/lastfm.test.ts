import assert from "node:assert/strict";

import {
  LastFmError,
  attrNumber,
  checked,
  imageUrl,
  named,
  stripHtml,
  unwrapList,
} from "../src/utils/lastfm.ts";

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

/** Captured from the live API: `artist` is named two different ways. */
check("an artist is named two ways and both are read", () => {
  // getrecenttracks sends artist["#text"], getlovedtracks and gettopalbums send
  // artist.name. Reading one leaves every row of the other as "Unknown artist".
  assert.equal(named({ name: "Portishead" }), "Portishead");
  assert.equal(named({ "#text": "Portishead" }), "Portishead");
  assert.equal(named({ name: "Portishead", "#text": "other" }), "Portishead");
});

check("an absent artist still produces something to show", () => {
  assert.equal(named(undefined), "Unknown artist");
  assert.equal(named({}, "Unknown album"), "Unknown album");
});

check("a collection of one arrives as an object, not an array", () => {
  // Measured: limit=1 answers `"artist": {...}`. Treating it as an array is how a
  // single-row page comes back empty.
  assert.deepEqual(unwrapList([{ name: "a" }]), [{ name: "a" }]);
  assert.deepEqual(unwrapList({ name: "a" } as unknown as { name: string }[]), [{ name: "a" }]);
  assert.deepEqual(unwrapList(undefined), []);
});

check("the biggest image that exists wins, and an empty one is not a url", () => {
  const images = [
    { size: "small", "#text": "s.png" },
    { size: "large", "#text": "l.png" },
    { size: "extralarge", "#text": "xl.png" },
  ];
  assert.equal(imageUrl(images), "xl.png");
  assert.equal(imageUrl(images.slice(0, 2)), "l.png");
  // No large, a small one is still better than a broken image.
  assert.equal(imageUrl([{ size: "small", "#text": "s.png" }]), "s.png");
  assert.equal(imageUrl(undefined), undefined);
  // Last.fm sends "" for an account with no artwork, which renders as a broken image.
  assert.equal(imageUrl([{ size: "large", "#text": "" }]), undefined);
});

check("@attr arrives as strings", () => {
  assert.equal(attrNumber({ total: "198" }, "total"), 198);
  assert.equal(attrNumber(undefined, "total"), 0);
  assert.equal(attrNumber({ total: "" }, "total"), 0);
});

check("a method that says it has rows and sends none is an error, not an empty list", () => {
  // This is the whole reason for checked(): reading the wrong member name gives
  // undefined, which unwraps to an empty list, and an empty list is exactly what
  // an account with nothing in it looks like. A port shipped that way and showed
  // "no top artists" for an account with 198 of them.
  assert.deepEqual(checked([1, 2], { total: "2" }, "artists"), [1, 2]);
  assert.throws(() => checked([], { total: "198" }, "top artists"), /reported 198 top artists/);

  // A total of zero is a real answer, not a mismatch.
  assert.deepEqual(checked([], { total: "0" }, "artists"), []);
  assert.deepEqual(checked([], undefined, "artists"), []);
});

check("the error says what went wrong in words", () => {
  assert.throws(() => checked([], { total: "5" }, "recent tracks"), LastFmError);
  try {
    checked([], { total: "5" }, "recent tracks");
  } catch (error) {
    assert.match((error as Error).message, /Last\.fm reported 5 recent tracks/);
  }
});

check("bio html becomes readable text", () => {
  assert.equal(stripHtml("<a href='/x'>Portishead</a> are a trip-hop band."), "Portishead are a trip-hop band.");
  assert.equal(stripHtml("a &amp; b"), "a & b");
  assert.equal(stripHtml("plain"), "plain");
});

console.log(`\nall ${checks} checks passed`);
check("tags are read out of the objects they arrive as", async () => {
  // Measured: artist.getInfo sends tags as [{name, url}], not as strings.
  const { artistInfo } = await import("../src/functions/browse.ts");
  const key = process.env.LASTFM_KEY;
  if (!key) {
    console.log("     (нет LASTFM_KEY — живая проверка пропущена)");
    return;
  }

  const info = await artistInfo(key, "Radiohead");
  assert.ok(info.tags.length > 0, "no tags came back");
  assert.ok(
    info.tags.every((tag) => typeof tag === "string" && tag.length > 0),
    JSON.stringify(info.tags.slice(0, 3)),
  );
});
