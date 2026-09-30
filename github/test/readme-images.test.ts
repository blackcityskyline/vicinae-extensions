import assert from "node:assert/strict";

import {
  extractReadmeImages,
  isBadgeUrl,
  resolveReadmeUrl,
} from "../src/utils/readme-images.ts";

/**
 * Self-check for README image extraction.
 *
 * Three real-world facts drive the design, all measured against live READMEs:
 *
 * - `vicinaehq/vicinae` has 7 images and every one is an HTML `<img>`, with 0
 *   in markdown syntax. A markdown-only parser finds nothing there.
 * - `BurntSushi/ripgrep` has 4 images and 3 are badges, so a Grid without badge
 *   filtering is a wall of shields.
 * - Image paths are often relative (`extra/vicinae.png`) and have to be
 *   resolved against the repository's default branch.
 */

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

const REPO = { owner: "acme", repo: "widget", defaultBranch: "main" };
const RAW = "https://raw.githubusercontent.com/acme/widget/main/";

// --- badge detection --------------------------------------------------------

check("known badge hosts are recognised", () => {
  for (const url of [
    "https://img.shields.io/badge/Build-passing-green",
    "https://badge.fury.io/js/npm/react",
    "https://badgen.net/npm/vite",
    "https://codecov.io/gh/acme/widget/branch/main/graph/badge.svg",
    "https://circleci.com/gh/acme/widget.svg?style=svg",
  ]) {
    assert.equal(isBadgeUrl(url), true, url);
  }
});

check("badge.svg on github.com is recognised by path", () => {
  assert.equal(isBadgeUrl("https://github.com/acme/widget/actions/workflows/ci/badge.svg"), true);
  assert.equal(isBadgeUrl("https://repology.org/badge/tiny-repos/widget"), true);
});

check("ordinary images are not mistaken for badges", () => {
  for (const url of [
    "https://raw.githubusercontent.com/acme/widget/main/extra/screenshot.png",
    "https://github.com/acme/widget/raw/main/docs/hero.png",
    "https://user-images.githubusercontent.com/1/2/3.png",
    "https://cdn.example.com/assets/diagram.svg",
  ]) {
    assert.equal(isBadgeUrl(url), false, url);
  }
});

// --- url resolution ---------------------------------------------------------

check("absolute urls are passed through", () => {
  assert.equal(resolveReadmeUrl("https://example.com/a.png", REPO), "https://example.com/a.png");
  assert.equal(resolveReadmeUrl("http://example.com/a.png", REPO), "http://example.com/a.png");
});

check("protocol-relative urls become https", () => {
  assert.equal(resolveReadmeUrl("//example.com/a.png", REPO), "https://example.com/a.png");
});

check("relative paths resolve against the default branch", () => {
  assert.equal(resolveReadmeUrl("extra/vicinae.png", REPO), `${RAW}extra/vicinae.png`);
  assert.equal(resolveReadmeUrl("./extra/vicinae.png", REPO), `${RAW}extra/vicinae.png`);
  assert.equal(resolveReadmeUrl("docs/img/a.png", REPO), `${RAW}docs/img/a.png`);
});

check("parent segments resolve, and cannot escape the branch", () => {
  // `..` pops path segments only. Letting it pop the branch would produce a URL
  // that 404s, which is worse than clamping to the branch root.
  assert.equal(resolveReadmeUrl("a/b/../../logo.png", REPO), `${RAW}logo.png`);
  assert.equal(resolveReadmeUrl("../logo.png", REPO), `${RAW}logo.png`);
  assert.equal(resolveReadmeUrl("../../../logo.png", REPO), `${RAW}logo.png`);
});

check("data uris are rejected, they are not fetchable", () => {
  assert.equal(resolveReadmeUrl("data:image/png;base64,AAAA", REPO), null);
});

check("an empty or whitespace url is rejected", () => {
  assert.equal(resolveReadmeUrl("", REPO), null);
  assert.equal(resolveReadmeUrl("   ", REPO), null);
});

// --- extraction -------------------------------------------------------------

check("markdown images are found in document order", () => {
  const found = extractReadmeImages(
    "![one](https://a.example/1.png)\ntext\n![two](https://a.example/2.png)",
    REPO,
  );
  assert.deepEqual(found.map((i) => i.src), ["https://a.example/1.png", "https://a.example/2.png"]);
  assert.deepEqual(found.map((i) => i.alt), ["one", "two"]);
});

check("a markdown title after the url is not part of it", () => {
  const [image] = extractReadmeImages('![alt](https://a.example/1.png "A title")', REPO);
  assert.equal(image?.src, "https://a.example/1.png");
  assert.equal(image?.alt, "alt");
});

check("html img tags are found, which is the common real form", () => {
  const found = extractReadmeImages(
    '<div align="center"><img src="extra/vicinae.png" width="200"><img src=\'extra/shot.png\'></div>',
    REPO,
  );
  assert.deepEqual(found.map((i) => i.src), [`${RAW}extra/vicinae.png`, `${RAW}extra/shot.png`]);
});

check("alt text is read from the html tag when present", () => {
  const [image] = extractReadmeImages('<img src="https://a.example/1.png" alt="Hero shot">', REPO);
  assert.equal(image?.alt, "Hero shot");
});

check("reference-style images resolve through their definition", () => {
  const found = extractReadmeImages(
    "![Logo][logo]\n\n[logo]: extra/logo.png\n",
    REPO,
  );
  assert.deepEqual(found.map((i) => i.src), [`${RAW}extra/logo.png`]);
});

check("a reference-style image with no definition is skipped", () => {
  assert.deepEqual(extractReadmeImages("![Logo][missing]\n", REPO), []);
});

check("links that are not images are ignored", () => {
  assert.deepEqual(extractReadmeImages("[not an image](https://a.example/x.png)", REPO), []);
  assert.deepEqual(extractReadmeImages("<a href='https://a.example/1.png'>x</a>", REPO), []);
});

check("badges are excluded by default", () => {
  const found = extractReadmeImages(
    "![badge](https://img.shields.io/x)\n![shot](https://a.example/shot.png)",
    REPO,
  );
  assert.deepEqual(found.map((i) => i.src), ["https://a.example/shot.png"]);
});

check("badges can be asked for", () => {
  const found = extractReadmeImages("![badge](https://img.shields.io/x)", REPO, { includeBadges: true });
  assert.equal(found.length, 1);
});

check("duplicates collapse, keeping the first occurrence", () => {
  const found = extractReadmeImages(
    '<img src="https://a.example/1.png">\n<img src="https://a.example/1.png">\n![x](https://a.example/1.png)',
    REPO,
  );
  assert.equal(found.length, 1);
});

check("a readme with no images yields an empty list", () => {
  assert.deepEqual(extractReadmeImages("# Title\n\nJust prose.", REPO), []);
  assert.deepEqual(extractReadmeImages("", REPO), []);
});

check("extraction does not mutate or crash on malformed markup", () => {
  const nasty = "![](  )<img src= >![a](<b>)![x](" + "![".repeat(200);
  assert.doesNotThrow(() => extractReadmeImages(nasty, REPO));
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
