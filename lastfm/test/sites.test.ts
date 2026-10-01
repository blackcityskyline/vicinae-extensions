import assert from "node:assert/strict";

import { SITES, siteQuery, siteSearchUrl } from "../src/utils/sites.ts";

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

check("YouTube Music opens the search page that serves results", () => {
  // Verified 200. There is no public search API without a key, so this is a page.
  assert.equal(siteSearchUrl("youtube", "Radiohead"), "https://music.youtube.com/search?q=Radiohead");
});

check("Monochrome is .st, because .tf only bounces there", () => {
  // monochrome.tf answers 503 with a page whose whole content is a meta refresh to
  // monochrome.st, and the search term is a path segment there, not a query.
  assert.equal(siteSearchUrl("monochrome", "Radiohead"), "https://monochrome.st/search/Radiohead");
  assert.equal(siteSearchUrl("monochrome", "Arthur Rubinstein"), "https://monochrome.st/search/Arthur%20Rubinstein");
});

check("the action is titled with the service's own name", () => {
  assert.equal(SITES.youtube, "YouTube Music");
  assert.equal(SITES.monochrome, "Monochrome");
});

check("a track or an album search carries its artist", () => {
  assert.equal(siteQuery({ artist: "Portishead", name: "Roads" }), "Portishead Roads");
  assert.equal(siteQuery({ artist: "Portishead", name: "Dummy" }), "Portishead Dummy");
});

check("an artist search is just the name", () => {
  assert.equal(siteQuery({ name: "Portishead" }), "Portishead");
  // A row whose artist member is the same thing is not doubled up.
  assert.equal(siteQuery({ artist: "Portishead", name: "Portishead" }), "Portishead");
  assert.equal(siteQuery({ artist: "  ", name: "Portishead" }), "Portishead");
});

check("the placeholder for a missing artist is not searched for", () => {
  // Searching "Unknown artist Roads" finds nothing at all.
  assert.equal(siteQuery({ artist: "Unknown artist", name: "Roads" }), "Roads");
});

check("a name cannot break out of the query", () => {
  // The whole reason one builder exists: urls are built by encoding, never by
  // concatenation. On Monochrome a slash that got through would become a second
  // path segment and hand the search page the wrong half.
  for (const site of ["youtube", "monochrome"] as const) {
    const url = siteSearchUrl(site, "AC/DC & Friends?live=true #1");
    const marker = site === "monochrome" ? "/search/" : "?q=";
    const value = url.slice(url.indexOf(marker) + marker.length);

    assert.ok(!/[&#?]/.test(value), `${site} left a raw separator: ${value}`);
    if (site === "monochrome") assert.ok(!value.includes("/"), `a slash became a segment: ${value}`);
    assert.equal(decodeURIComponent(value), "AC/DC & Friends?live=true #1", `${site} lost characters`);
  }
});

console.log(`\nall ${checks} checks passed`);