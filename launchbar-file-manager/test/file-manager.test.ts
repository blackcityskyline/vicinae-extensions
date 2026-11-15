import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { clipboardPaths, existingPaths } from "../src/clipboard-paths.ts";
import {
  expandHome,
  formatSize,
  parseUserDirs,
} from "../src/fs-utils.ts";
import { fuzzyMatch, fuzzyScore } from "../src/fuzzy.ts";
import { renderPreview } from "../src/preview-body.ts";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  await check("clipboardPaths reads a Nautilus uri-list", () => {
    const text = [
      "file:///home/black/My%20Documents/report.txt",
      "file:///home/black/Music/",
      "# a comment",
      "",
    ].join("\r\n");
    assert.deepEqual(clipboardPaths(text, "/home/black"), [
      "/home/black/My Documents/report.txt",
      "/home/black/Music/",
    ]);
  });

  await check("clipboardPaths accepts plain paths but not URLs or relatives", () => {
    const text = ["/tmp/a.txt", "~/notes.md", "~", "https://example.com/x", "relative/path"].join("\n");
    assert.deepEqual(clipboardPaths(text, "/home/black"), [
      "/tmp/a.txt",
      "/home/black/notes.md",
      "/home/black",
    ]);
  });

  await check("clipboardPaths drops duplicates and remote hosts", () => {
    const text = ["/tmp/a.txt", "/tmp/a.txt", "file://elsewhere/tmp/b.txt"].join("\n");
    assert.deepEqual(clipboardPaths(text, "/home/black"), ["/tmp/a.txt"]);
  });

  await check("clipboardPaths reads what HyprFM and dfiles write", () => {
    // HyprFM: Qt's QMimeData text is one file URL per line.
    assert.deepEqual(
      clipboardPaths("file:///home/black/notes.md\nfile:///home/black/My%20Docs", "/home/black"),
      ["/home/black/notes.md", "/home/black/My Docs"],
    );
    // dfiles: text/plain is bare paths, gnome-copied-files carries a cut/copy header.
    assert.deepEqual(
      clipboardPaths("copy\nfile:///tmp/a.txt\nfile:///tmp/b.txt\n", "/home/black"),
      ["/tmp/a.txt", "/tmp/b.txt"],
    );
    assert.deepEqual(clipboardPaths("cut\n/home/black/x", "/home/black"), ["/home/black/x"]);
  });

  await check("existingPaths keeps only what is on disk", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "lbfm-"));
    mkdirSync(join(dir, "folder"));
    writeFileSync(join(dir, "file.txt"), "x");
    assert.deepEqual(
      await existingPaths([join(dir, "file.txt"), join(dir, "folder"), join(dir, "missing")]),
      [join(dir, "file.txt"), join(dir, "folder")],
    );
    rmSync(dir, { recursive: true, force: true });
  });

  await check("renderPreview picks the body for each kind of file", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "lbfm-prev-"));
    writeFileSync(join(dir, "a.png"), "not really a png");
    writeFileSync(join(dir, "note.md"), "# Title\n\ntext");
    writeFileSync(join(dir, "code.ts"), "const x = 1;");
    writeFileSync(join(dir, "blob.txt"), Buffer.from([1, 0, 2]));
    writeFileSync(join(dir, "clip.mp4"), "x");
    writeFileSync(join(dir, "big.log"), "y".repeat(70 * 1024));

    assert.match(await renderPreview(join(dir, "a.png")), /^!\[a\.png\]\(file:\/\//);
    assert.equal(await renderPreview(join(dir, "note.md")), "# Title\n\ntext");
    assert.match(await renderPreview(join(dir, "code.ts")), /^````ts\nconst x = 1;\n````$/);
    assert.match(await renderPreview(join(dir, "blob.txt")), /^## Binary file/);
    assert.match(await renderPreview(join(dir, "clip.mp4")), /^## No inline preview/);
    const big = await renderPreview(join(dir, "big.log"));
    assert.match(big, /truncated at 64 KB/);
    assert.ok(big.length < 70 * 1024, "the whole log must not be embedded");

    rmSync(dir, { recursive: true, force: true });
  });

  await check("parseUserDirs resolves $HOME and ignores noise", () => {
    const text = [
      "# Written by xdg-user-dirs-update",
      'XDG_DESKTOP_DIR="$HOME/Desktop"',
      'XDG_DOWNLOAD_DIR="/srv/downloads"',
      "not a setting",
    ].join("\n");
    const dirs = parseUserDirs(text, "/home/black");
    assert.equal(dirs.get("XDG_DESKTOP_DIR"), "/home/black/Desktop");
    assert.equal(dirs.get("XDG_DOWNLOAD_DIR"), "/srv/downloads");
    assert.equal(dirs.size, 2);
  });

  await check("expandHome handles ~ forms only", () => {
    assert.equal(expandHome("~"), os.homedir());
    assert.equal(expandHome("~/docs"), join(os.homedir(), "docs"));
    assert.equal(expandHome("/tmp"), "/tmp");
    assert.equal(expandHome(""), os.homedir());
    assert.equal(expandHome("~other/x"), "~other/x");
  });

  await check("formatSize formats folders and byte scales", () => {
    assert.equal(formatSize(0, true), "Folder");
    assert.equal(formatSize(512, false), "512 B");
    assert.equal(formatSize(2048, false), "2.0 KB");
    assert.equal(formatSize(5 * 1024 * 1024, false), "5.0 MB");
  });

  await check("fuzzyScore ranks prefixes and abbreviations above typos", () => {
    assert.equal(fuzzyScore("", "anything"), 0);
    const prefix = fuzzyScore("doc", "document.txt") ?? -1;
    const middle = fuzzyScore("doc", "my-document.txt") ?? -1;
    assert.ok(prefix > middle, `${prefix} should beat ${middle}`);
    assert.ok(fuzzyMatch("vsc", "Visual Studio Code"));
    assert.ok(fuzzyMatch("documnets", "documents"));
    assert.equal(fuzzyScore("zzz", "documents"), null);
  });

  console.log(failed === 0 ? `\n${passed} passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
