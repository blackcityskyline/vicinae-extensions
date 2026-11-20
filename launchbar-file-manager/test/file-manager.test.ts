import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

import { clipboardPaths, existingPaths } from "../src/clipboard-paths.ts";
import {
  expandHome,
  fileKind,
  formatSize,
  listDir,
  parseUserDirs,
  tildifyPath,
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

  await check("tildifyPath replaces home and leaves lookalikes alone", () => {
    assert.equal(tildifyPath("/home/black", "/home/black"), "~");
    assert.equal(tildifyPath("/home/black/dev/x", "/home/black"), "~/dev/x");
    assert.equal(tildifyPath("/home/blacker/x", "/home/black"), "/home/blacker/x");
    assert.equal(tildifyPath("/srv", "/home/black"), "/srv");
  });

  await check("listDir sorts folder first, then numbers naturally", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "lbfm-sort-"));
    mkdirSync(join(dir, "adir"));
    writeFileSync(join(dir, "file10.txt"), "x");
    writeFileSync(join(dir, "file2.txt"), "x");
    const names = (await listDir(dir, false)).map((e) => e.name);
    assert.deepEqual(names, ["adir", "file2.txt", "file10.txt"]);
    rmSync(dir, { recursive: true, force: true });
  });

  await check("listDir marks symlinks, keeps broken ones, and shows permissions", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "lbfm-link-"));
    mkdirSync(join(dir, "target-dir"));
    writeFileSync(join(dir, "target-file"), "x");
    symlinkSync(join(dir, "target-dir"), join(dir, "link-dir"));
    symlinkSync(join(dir, "target-file"), join(dir, "link-file"));
    symlinkSync(join(dir, "gone"), join(dir, "broken"));

    const entries = await listDir(dir, false);
    const get = (name: string) => {
      const found = entries.find((e) => e.name === name);
      assert.ok(found, `${name} must be listed`);
      return found;
    };

    assert.equal(get("link-dir").isDirectory, true);
    assert.equal(get("link-dir").isSymlink, true);
    assert.equal(get("link-dir").broken, false);
    assert.equal(get("link-file").isDirectory, false);
    assert.equal(get("link-file").isSymlink, true);
    assert.equal(get("broken").broken, true);
    assert.equal(get("broken").isDirectory, false);
    assert.equal(get("broken").linkTarget, join(dir, "gone"));
    assert.equal(fileKind(get("broken")), "Broken link");
    assert.equal(fileKind(get("link-dir")), "Link to folder");
    assert.match(get("target-file").permissions, /^[0-7]{3}$/);

    rmSync(dir, { recursive: true, force: true });
  });

  await check("listDir hides what .gitignore excludes only when asked", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "lbfm-git-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, ".gitignore"), "*.log\nbuild/\n");
    writeFileSync(join(dir, "keep.txt"), "x");
    writeFileSync(join(dir, "drop.log"), "x");
    mkdirSync(join(dir, "build"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", ".gitignore"), "!keep.log\n");
    writeFileSync(join(dir, "sub", "keep.log"), "x");
    writeFileSync(join(dir, "sub", "drop.log"), "x");

    const plain = (await listDir(dir, true, false)).map((e) => e.name);
    assert.ok(plain.includes("drop.log"), "without the setting nothing is hidden");
    assert.ok(plain.includes("build"));

    const filtered = (await listDir(dir, true, true)).map((e) => e.name);
    assert.ok(filtered.includes("keep.txt"));
    assert.ok(!filtered.includes("drop.log"));
    assert.ok(!filtered.includes("build"));

    const sub = (await listDir(join(dir, "sub"), true, true)).map((e) => e.name);
    assert.ok(sub.includes("keep.log"), "a nested negation must be honoured");
    assert.ok(!sub.includes("drop.log"));

    rmSync(dir, { recursive: true, force: true });
  });

  console.log(failed === 0 ? `\n${passed} passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
