import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// tsx runs this file as CommonJS, so no top-level await: the module is imported inside
// main(). The module reads preferences and stats the folder at import time, so the folder
// has to exist before it loads.
let root = "";

let checks = 0;
async function check(name: string, body: () => Promise<void>) {
  try {
    await body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

/** All times in the past, so nothing is ambiguous about "newest". */
const base = Date.UTC(2020, 0, 1) / 1000;

function at(iso: string, name: string, content = "x"): string {
  const path = join(root, "Downloads", name);
  writeFileSync(path, content);
  const when = new Date(iso).getTime() / 1000;
  utimesSync(path, when, when);
  return path;
}

async function main() {
  root = mkdtempSync(join(tmpdir(), "dl-folder-"));
  const folder = join(root, "Downloads");
  mkdirSync(folder);
  // The module picks ~/Downloads unless told otherwise, and the preference is read at
  // import time. Point HOME at the fixture so the default path lands here.
  process.env.HOME = root;

  // Three files whose mtime, birthtime and name disagree, so each ordering has exactly
  // one right answer.
  const middle = at("2021-06-01T00:00:00Z", "b-middle.txt");
  const oldest = at("2020-01-01T00:00:00Z", "a-oldest.txt");
  const newest = at("2022-12-31T00:00:00Z", "c-newest.txt");
  const hidden = join(folder, ".hidden");
  writeFileSync(hidden, "x");

  const { getDownloads, getLatestDownload, downloadsFolder, formatFileSize, getFileType, keywordsFor } =
    await import("../src/utils.tsx");

  const names = (rows: { file: string }[]) => rows.map((row) => row.file);

  await check("the folder is the one the preference names", async () => {
    assert.equal(downloadsFolder, folder, `got ${downloadsFolder}, wanted ${folder}`);
  });

  await check("newest first, which is what the description promises", async () => {
    assert.deepEqual(names(getDownloads()), ["c-newest.txt", "b-middle.txt", "a-oldest.txt"]);
  });

  await check("a hidden file is left out by default", async () => {
    assert.ok(!names(getDownloads()).includes(".hidden"), "a dotfile came through unasked");
  });

  await check("the latest download is the newest, not the first alphabetically", async () => {
    assert.equal(getLatestDownload()?.file, "c-newest.txt");
  });

  await check("a file that cannot be read does not take the listing down with it", async () => {
    // Broken symlink: opendirSync lists the name, statSync follows the link and throws.
    // getDownloads walks a folder of real downloads, where a half-written file or a
    // dangling link is normal rather than exotic.
    const { symlinkSync, mkdirSync: mk, writeFileSync: wr } = await import("node:fs");
    const gone = join(root, "vanished");
    wr(join(root, ".gone-target"), "x");
    symlinkSync(join(root, ".gone-target"), gone);
    rmSync(join(root, ".gone-target"), { force: true });

    const rows = getDownloads();
    assert.ok(rows.length >= 3, `listing collapsed to ${rows.length}`);
    assert.ok(
      rows.every((row: { path: string }) => row.path.startsWith(folder)),
      "something from outside the folder appeared",
    );
    assert.ok(rows.every((row: { size: number }) => row.size >= 0), "a row has no size");
  });

  await check("a subdirectory reports how many items it holds", async () => {
    const sub = join(folder, "sub");
    mkdirSync(sub);
    writeFileSync(join(sub, "one.txt"), "1");
    writeFileSync(join(sub, "two.txt"), "2");

    const row = getDownloads().find((entry: { file: string }) => entry.file === "sub");

    assert.ok(row, "the subdirectory is missing from the listing");
    assert.equal(row.isDirectory, true);
    assert.equal(row.size, 0, "a directory was given a byte size");
    assert.equal(row.itemCount, 2);
  });

  await check("a row never carries a path outside the folder it was read from", async () => {
    // The listing comes from opendirSync and is trusted afterwards by the delete
    // actions. A path that escaped would make "Delete Download" mean deleting whatever
    // it points at.
    for (const row of getDownloads()) {
      assert.ok(row.path.startsWith(folder + "/"), `escaped: ${row.path}`);
    }
  });

  await check("a name with a quote cannot break anything downstream", async () => {
    const evil = join(folder, `it's "x"; rm -rf ~.txt`);
    writeFileSync(evil, "x");
    assert.ok(names(getDownloads()).includes(`it's "x"; rm -rf ~.txt`));

    // Reads and deletes go through execFile with an argv array, so the name is data.
    rmSync(evil);
  });

  await check("sizes read as sizes", async () => {
    assert.equal(formatFileSize(0), "0 B");
    assert.equal(formatFileSize(1), "1 B");
    assert.equal(formatFileSize(1023), "1023 B");
    assert.equal(formatFileSize(1024), "1 KB");
    assert.equal(formatFileSize(1536), "1.5 KB");
    assert.equal(formatFileSize(1024 * 1024 * 3), "3 MB");
    assert.equal(formatFileSize(1024 ** 4), "1 TB");
  });

  await check("a type reads as a type", async () => {
    assert.equal(getFileType({ file: "x.zip", isDirectory: false } as never), "ZIP");
    assert.equal(getFileType({ file: "x", isDirectory: false } as never), "File");
    assert.equal(getFileType({ file: "x.zip", isDirectory: true } as never), "Folder");
  });

  await check("a row answers to its own name and to what it is", async () => {
    // The search bar is where the question is typed and the list filters against it, so
    // without these the list empties as you type: a row titled "Отчёт (2).pdf" is not
    // found by "otchet", and nothing at all answers to "pdf".
    const words = keywordsFor({
      file: "Отчёт (2).pdf",
      isDirectory: false,
      size: 1536,
    } as never);

    for (const expected of ["Отчёт (2).pdf", "Отчёт (2)", "Отчёт", "pdf", "PDF", "file", "1.5 KB"]) {
      assert.ok(words.includes(expected), `"${expected}" is not among: ${words.join(", ")}`);
    }
    assert.ok(!words.includes(""), "an empty word makes the filter match everything");
  });

  await check("a repeated download is found by the name it repeats", async () => {
    // Downloads are full of file (1).zip, file (2).zip. Searching the stem has to reach
    // every one of them, and the "(2)" must not become part of the search.
    const words = keywordsFor({ file: "file (12).zip", isDirectory: false, size: 10 } as never);

    assert.ok(words.includes("file"), `the bare stem is missing: ${words.join(", ")}`);
    assert.ok(words.includes("file (12).zip"), "the exact name is missing");
  });

  await check("a folder answers to folder and to how much is in it", async () => {
    const words = keywordsFor({ file: "Telegram Desktop", isDirectory: true, itemCount: 7 } as never);

    assert.ok(words.includes("folder"), words.join(", "));
    assert.ok(words.includes("7 items"), words.join(", "));
    assert.ok(!words.includes("file"), "a folder answers to 'file'");
    assert.ok(!words.some((word) => word.endsWith("B")), `a folder was given a size: ${words.join(", ")}`);
  });

  await check("a name with no extension is still searchable", async () => {
    const words = keywordsFor({ file: "LICENSE", isDirectory: false, size: 0 } as never);

    assert.ok(words.includes("LICENSE"), words.join(", "));
    assert.ok(!words.includes(""), "an empty extension became a keyword");
  });

  await check("a dotfile does not turn its whole name into an extension", async () => {
    const words = keywordsFor({ file: ".bashrc", isDirectory: false, size: 10 } as never);

    assert.ok(words.includes(".bashrc"), words.join(", "));
    assert.ok(!words.includes("bashrc"), `the leading dot was eaten: ${words.join(", ")}`);
  });

  await check("a trailing dot is not an extension", async () => {
    const words = keywordsFor({ file: "weird.", isDirectory: false, size: 1 } as never);

    assert.ok(words.includes("weird."), words.join(", "));
    assert.ok(!words.includes(""), words.join(", "));
  });

  await check("the file it listed is the file on disk, by content", async () => {
    assert.equal(readFileSync(newest, "utf-8"), "x");
    assert.equal(readFileSync(oldest, "utf-8"), "x");
    assert.equal(readFileSync(middle, "utf-8"), "x");
  });

  rmSync(root, { recursive: true, force: true });
  console.log(`\nall ${checks} checks passed`);
}

main().catch((error: unknown) => {
  console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
