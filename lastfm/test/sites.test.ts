import assert from "node:assert/strict";

import { siteSearchUrl, siteLabel } from "../src/utils/sites.ts";

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

check("YouTube Music still opens the search page that serves results", () => {
  // Verified 200. There is no public search API without a key, so this is a page.
  assert.equal(
    siteSearchUrl("youtube-music", { name: "Radiohead" }),
    "https://music.youtube.com/search?q=Radiohead",
  );
});

check("monochrome takes the query as a path segment, not a query string", () => {
  // The router reads the term off the path: its handler is
  // `case"search": await this.renderSearchPage(decodeURIComponent(rest))`, where
  // `rest` is everything after the first "/". A ?q= link opens the search page
  // and then searches for "" — which is exactly what it did.
  //
  // It also has to be .st: monochrome.tf answers 503 with a page whose whole
  // content is a meta refresh to monochrome.st.
  assert.equal(
    siteSearchUrl("monochrome", { name: "Radiohead" }),
    "https://monochrome.st/search/Radiohead",
  );
  assert.equal(
    siteSearchUrl("monochrome", { name: "Arthur Rubinstein" }),
    "https://monochrome.st/search/Arthur%20Rubinstein",
  );
});

check("both sites carry the artist for a track or an album", () => {
  assert.equal(siteSearchUrl("youtube-music", { artist: "Portishead", name: "Roads" }), "https://music.youtube.com/search?q=Portishead%20Roads");
  assert.equal(siteSearchUrl("monochrome", { artist: "Portishead", name: "Roads" }), "https://monochrome.st/search/Portishead%20Roads");
});

check("an artist row searches for the name only", () => {
  assert.equal(siteSearchUrl("monochrome", { name: "Portishead" }), "https://monochrome.st/search/Portishead");
  // A row whose artist member is the same thing is not doubled up.
  assert.equal(siteSearchUrl("monochrome", { artist: "Portishead", name: "Portishead" }), "https://monochrome.st/search/Portishead");
  assert.equal(siteSearchUrl("monochrome", { artist: "  ", name: "Portishead" }), "https://monochrome.st/search/Portishead");
});

check("the placeholder for a missing artist is not searched for", () => {
  // An unknown artist arrives as the placeholder, and searching
  // "Unknown artist Roads" finds nothing at all.
  assert.equal(siteSearchUrl("monochrome", { artist: "Unknown artist", name: "Roads" }), "https://monochrome.st/search/Roads");
});

check("a name cannot break out of the query", () => {
  // This is the whole reason every site goes through one builder: the url must be
  // built by encoding, never by concatenation. On monochrome a "/" would become a
  // second path segment and the router would hand the search page the wrong half.
  for (const site of ["youtube-music", "monochrome"] as const) {
    const url = siteSearchUrl(site, { name: "AC/DC & Friends?live=true #1" });
    const value = url.slice(url.indexOf(site === "monochrome" ? "/search/" : "?q=") + (site === "monochrome" ? 8 : 3));
    assert.ok(!/[&#?]/.test(value), `${site} left a raw separator in the value: ${value}`);
    assert.equal(decodeURIComponent(value), "AC/DC & Friends?live=true #1", `${site} lost characters`);
    if (site === "monochrome") {
      assert.ok(!value.includes("/"), `a slash became a path separator: ${value}`);
    }
  }
});

check("a name with spaces is encoded, not pasted", () => {
  assert.equal(
    siteSearchUrl("monochrome", { artist: "Portishead", name: "Roads (Dummy)" }),
    "https://monochrome.st/search/Portishead%20Roads%20(Dummy)",
  );
});

check("the label is what the action is called", () => {
  assert.equal(siteLabel("youtube-music"), "YouTube Music");
  assert.equal(siteLabel("monochrome"), "Monochrome");
});

console.log(`\nall ${checks} checks passed`);