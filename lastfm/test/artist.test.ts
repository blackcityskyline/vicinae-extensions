import assert from "node:assert/strict";

import { attrNumber, plays, stripHtml } from "../src/utils/lastfm.ts";
import { artistMarkdown } from "../src/utils/artist.ts";
import type { ArtistPage } from "../src/api/lastfm.ts";

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

function page(overrides: Partial<ArtistPage> = {}): ArtistPage {
  return {
    name: "Portishead",
    url: "https://www.last.fm/music/Portishead",
    image: "https://img.test/174s/a.png",
    listeners: "3424285",
    playcount: "146571369",
    tags: ["trip-hop", "electronica"],
    summary: "",
    tracks: [],
    albums: [],
    similar: [],
    ...overrides,
  };
}

check("paging members are read as numbers, not left as strings", () => {
  assert.equal(attrNumber({ totalPages: "412", page: "3" }, "totalPages"), 412);
  assert.equal(attrNumber({ totalPages: "412" }, "page"), 0, "absent is zero");
  assert.equal(attrNumber(undefined, "totalPages"), 0);
  assert.equal(attrNumber({ totalPages: "not a number" }, "totalPages"), 0);
});

check("play counts are readable at the sizes Last.fm reports", () => {
  // Measured values: 146,571,369 plays and 3,424,285 listeners.
  assert.equal(plays("146571369"), "146.6M");
  assert.equal(plays("3424285"), "3.4M");
  assert.equal(plays("12400"), "12k");
  assert.equal(plays("1500"), "1.5k");
  assert.equal(plays("315"), "315");
  assert.equal(plays("0"), "", "zero reads as nothing, not as 0");
  assert.equal(plays(undefined), "");
  assert.equal(plays("rubbish"), "");
});

check("a wiki summary is stripped of html, script contents included", () => {
  assert.equal(stripHtml("<p>Hello <b>there</b></p>"), "Hello there");
  assert.equal(stripHtml("<style>.x{color:red}</style>text"), "text", "a stylesheet's contents are not text");
  assert.equal(stripHtml("<script>alert(1)</script>text"), "text", "a script's contents are not text");
  assert.equal(stripHtml("a &amp; b &lt;c&gt;"), "a & b <c>");
  assert.equal(stripHtml("line one\n   line two"), "line one line two");
});

check("the artist page reads as a document, with nothing empty in it", () => {
  const markdown = artistMarkdown(
    page({
      summary: "<p>Formed in <b>1991</b> in Bristol.</p>",
      tracks: [
        { name: "Roads", artist: "Portishead", album: "Dummy", url: "https://x.test/roads", rank: 1, playcount: "9876543" },
        { name: "Wandering Star", artist: "Portishead", album: "Dummy", url: "https://x.test/ws", rank: 2, playcount: "5432100" },
      ],
      albums: [{ name: "Dummy", artist: "Portishead", url: "https://x.test/dummy", playcount: "12000000", rank: 1 }],
      similar: [{ name: "Massive Attack", url: "https://x.test/ma", listeners: "3000000" }],
    }),
  );

  assert.match(markdown, /^# Portishead/);
  assert.match(markdown, /3\.4M listeners · 146\.6M plays/);
  assert.match(markdown, /trip-hop · electronica/);
  assert.match(markdown, /Formed in 1991 in Bristol\./, "the tags are gone, not converted");
  assert.match(markdown, /## Top tracks/);
  assert.match(markdown, /1\. \*\*Roads\*\* — 9\.9M/);
  assert.match(markdown, /## Top albums/);
  assert.match(markdown, /- \*\*Dummy\*\* — 12\.0M/);
  assert.match(markdown, /## Similar/);
  assert.match(markdown, /- Massive Attack — 3\.0M listeners/);

  // No heading for a section with nothing in it, and no stray blank block.
  assert.ok(!/##\s*\n/.test(markdown), "an empty heading survived");
  assert.ok(!/\n{3,}/.test(markdown), "the document has a run of blank lines");
});

check("an artist with nothing known still produces a heading", () => {
  const markdown = artistMarkdown(page({ listeners: "", playcount: "", tags: [] }));
  assert.equal(markdown, "# Portishead");
  assert.ok(!/undefined|NaN/.test(markdown), `"${markdown}" leaked a value`);
});

check("a track with no play count is listed without one", () => {
  const markdown = artistMarkdown(
    page({ tracks: [{ name: "Roads", artist: "Portishead", album: "", url: "https://x.test/roads", rank: 1 }] }),
  );
  assert.match(markdown, /^1\. \*\*Roads\*\*$/m, "listed with no count and nothing after it");
});

check("an html summary that is only tags does not leave a blank", () => {
  const markdown = artistMarkdown(page({ summary: "<div><br></div>" }));
  assert.ok(!/\n{2,}/.test(markdown), `"${markdown}" left a gap`);
});

console.log(`\nall ${checks} checks passed`);
