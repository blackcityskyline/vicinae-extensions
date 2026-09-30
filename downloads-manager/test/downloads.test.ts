import assert from "node:assert/strict";

import { formatSize, isInside } from "../src/utils/downloads.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

// ---------------------------------------------------------------------------
// isInside. Everything destructive goes through this: the path arrives from a
// directory listing, and a listing can hand back something outside the folder
// it came from.
// ---------------------------------------------------------------------------

check("a file in the folder is inside it", () => {
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads/file.zip"), true);
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads/a/b/c.tar.gz"), true);
});

check("the folder itself is not inside the folder", () => {
  // Otherwise "delete ~/Downloads" would pass the check it is supposed to fail.
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads"), false);
});

check("a parent, a sibling and the home directory are all outside", () => {
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads"), false);
  assert.equal(isInside("/home/black/Downloads", "/home/black"), false);
  assert.equal(isInside("/home/black/Downloads", "/home/black/Documents/x"), false);
  assert.equal(isInside("/home/black/Downloads", "/etc/passwd"), false);
});

// The trap that a startsWith() guard walks into: "Downloads2" starts with
// "Downloads" as a string and is a different directory.

check("a name that merely starts with the folder name is outside", () => {
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads2/secret"), false);
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads.old"), false);
});

check("a traversal out of the folder is outside", () => {
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads/../../.ssh"), false);
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads/../Downloads/x"), true);
});

check("a trailing slash on the folder does not change the answer", () => {
  assert.equal(isInside("/home/black/Downloads/", "/home/black/Downloads/file.zip"), true);
  assert.equal(isInside("/home/black/Downloads", "/home/black/Downloads2"), false);
});

// ---------------------------------------------------------------------------
// formatSize. Byte counts come off the filesystem, so the edges are 0, 1, and
// the boundary where the unit changes.
// ---------------------------------------------------------------------------

check("small sizes are shown in bytes", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1), "1 B");
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(1023), "1023 B");
});

check("the unit changes at the boundary, not after it", () => {
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatSize(1024 ** 2), "1 MB");
  assert.equal(formatSize(1024 ** 3), "1 GB");
});

check("large sizes keep two decimals at most", () => {
  assert.equal(formatSize(1024 ** 4), "1 TB");
  assert.equal(formatSize(1234567890), "1.15 GB");
  assert.equal(formatSize(3 * 1024 ** 3 + 512 * 1024 ** 2), "3.5 GB");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
