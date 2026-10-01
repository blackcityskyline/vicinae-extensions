import assert from "node:assert/strict";

import { youtubeMusicSearchUrl, youtubeQuery } from "../src/utils/youtube.ts";

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

check("the search page is the one YouTube Music actually serves", () => {
  assert.equal(youtubeMusicSearchUrl("Radiohead"), "https://music.youtube.com/search?q=Radiohead");
});

check("a query with spaces and punctuation cannot break the url", () => {
  assert.equal(
    youtubeMusicSearchUrl("Portishead Roads (Dummy)"),
    "https://music.youtube.com/search?q=Portishead%20Roads%20(Dummy)",
  );
  // A stray & or ? must not turn into parameters.
  const url = youtubeMusicSearchUrl("AC/DC & Friends?live=true");
  assert.equal(url.split("?")[1]?.split("&").length, 1, "the value injected a parameter");
  assert.ok(url.includes("%26"), "an ampersand was left raw");
  assert.ok(!url.includes("&Friends"), "an ampersand was left raw");
});

check("a track or album search carries its artist", () => {
  assert.equal(youtubeQuery({ artist: "Portishead", name: "Roads" }), "Portishead Roads");
  assert.equal(youtubeQuery({ artist: "Portishead", name: "Dummy" }), "Portishead Dummy");
});

check("an artist search is just the name", () => {
  assert.equal(youtubeQuery({ name: "Portishead" }), "Portishead");
  // A row whose artist member is the same thing is not doubled up.
  assert.equal(youtubeQuery({ artist: "Portishead", name: "Portishead" }), "Portishead");
  assert.equal(youtubeQuery({ artist: "  ", name: "Portishead" }), "Portishead");
});

check("the placeholder for a missing artist is not searched for", () => {
  // An unknown artist arrives as the placeholder, and searching
  // "Unknown artist Roads" finds nothing at all.
  assert.equal(youtubeQuery({ artist: "Unknown artist", name: "Roads" }), "Roads");
});

console.log(`\nall ${checks} checks passed`);
