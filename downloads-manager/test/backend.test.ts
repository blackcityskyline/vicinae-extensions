import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The end-to-end check: a real download, then the extension's whole read and delete
 * path over what arrived.
 *
 * `downloads.test.ts` and `trash.test.ts` work on files written by the test itself, so
 * they never ask whether a file a browser wrote — with its real size, its real name, its
 * real extension — is listed, previewed, formatted and deleted correctly. This test does:
 * two files are fetched over HTTPS into a folder of their own, and every function the
 * commands use is then called on those two files and its answer compared with the bytes
 * on disk.
 *
 * Nothing touches the user's own folder: `$HOME` and `$XDG_DATA_HOME` point into a
 * throwaway directory, so `~/Downloads`, the trash and the local storage are the test's
 * own. The trash check is therefore a real `gio trash`, not a simulation.
 *
 * tsx runs this file as CommonJS, so there is no top-level await: the environment is set
 * up and the module imported inside main(). The module resolves `~/Downloads` at import
 * time, so the downloads must exist before it loads.
 */

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const TEXT_URL = "https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md";
const IMAGE_URL = "https://raw.githubusercontent.com/github/explore/main/topics/nodejs/nodejs.png";

/** A real transfer, written to disk exactly as received. */
function fetchToFile(url: string, dest: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects === 0) {
          reject(new Error(`${url} redirected more than five times`));
          return;
        }
        resolve(fetchToFile(new URL(response.headers.location, url).toString(), dest, redirects - 1));
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`${url} answered ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        writeFileSync(dest, body);
        resolve(body);
      });
    });

    request.on("error", reject);
  });
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "dl-e2e-home-"));
  process.env.HOME = root;
  process.env.XDG_DATA_HOME = join(root, ".local", "share");

  const folder = join(root, "Downloads");
  mkdirSync(folder);

  const textPath = join(folder, "fs.md");
  const imagePath = join(folder, "nodejs.png");
  const textBytes = await fetchToFile(TEXT_URL, textPath);
  // A second apart, so "newest" cannot come down to a name tiebreak on a coarse clock.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const imageBytes = await fetchToFile(IMAGE_URL, imagePath);

  const {
    getDownloads,
    getDownloadsCount,
    getLatestDownload,
    hasAccessToDownloadsFolder,
    getCustomDownloadsFolder,
    downloadsFolder,
    isImageFile,
    isTextFile,
    getTextFilePreview,
    getQuickLookPreviewDataUrl,
    formatFileSize,
    getFileExtension,
    getFileType,
    keywordsFor,
    moveToTrash,
    deleteFileOrFolder,
    getDeletionBehavior,
    getDeletionBehaviorTitle,
    toggleDeletionBehavior,
    getPermanentDeleteConfirmationChoice,
  } = await import("../src/utils.tsx");
  const { reveal } = await import("../src/focus.ts");

  const trashFiles = join(process.env.XDG_DATA_HOME, "Trash", "files");
  const trashInfo = join(process.env.XDG_DATA_HOME, "Trash", "info");

  await check("the folder the extension resolves is where the downloads went", () => {
    assert.equal(downloadsFolder, folder, `got ${downloadsFolder}`);
    assert.equal(getCustomDownloadsFolder(), folder, "the platform default left the fixture home");
    assert.equal(hasAccessToDownloadsFolder(), true, "the folder it just read is not readable");
  });

  await check("a real transfer lands byte for byte", () => {
    assert.ok(textBytes.length > 10_000, `the text transfer is suspiciously small: ${textBytes.length}`);
    assert.ok(imageBytes.length > 1000, `the image transfer is suspiciously small: ${imageBytes.length}`);
    assert.deepEqual(readFileSync(textPath), textBytes, "the text on disk is not what was received");
    assert.deepEqual(readFileSync(imagePath), imageBytes, "the image on disk is not what was received");
    assert.deepEqual(
      [...imageBytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "the downloaded image is not a PNG",
    );
  });

  await check("the listing reports the size each file actually has", async () => {
    const rows = getDownloads();
    assert.deepEqual(
      rows.map((row: { file: string }) => row.file),
      ["nodejs.png", "fs.md"],
      "the listing is not newest first",
    );

    const byName = new Map(rows.map((row: { file: string }) => [row.file, row]));
    assert.equal(byName.get("nodejs.png")?.size, imageBytes.length);
    assert.equal(byName.get("fs.md")?.size, textBytes.length);
    assert.equal(byName.get("nodejs.png")?.isDirectory, false);
    assert.equal(byName.get("nodejs.png")?.path, imagePath);
    assert.equal(statSync(imagePath).size, imageBytes.length, "stat disagrees with the transfer");
    assert.equal(getDownloadsCount(), 2);
  });

  await check("the newest download is the one that finished last", () => {
    assert.equal(getLatestDownload()?.file, "nodejs.png");
  });

  await check("what a browser leaves behind while downloading is not a download", () => {
    // Firefox and Chromium write `<name>.part` / `<name>.crdownload` and rename on
    // completion; the dot prefix is what keeps a half-written file out of the list.
    const partial = join(folder, ".fs.md.crdownload");
    writeFileSync(partial, "half");

    const names = getDownloads().map((row: { file: string }) => row.file);
    assert.ok(!names.includes(".fs.md.crdownload"), "a half-written file was listed");
    assert.equal(getDownloadsCount(), 2, "the count included a hidden file");

    rmSync(partial);
  });

  await check("a page of the listing is a page, not a copy of everything", () => {
    const first = getDownloads(1, 0).map((row: { file: string }) => row.file);
    const second = getDownloads(1, 1).map((row: { file: string }) => row.file);

    assert.deepEqual(first, ["nodejs.png"]);
    assert.deepEqual(second, ["fs.md"]);
  });

  await check("a downloaded folder reports what is inside it", () => {
    const album = join(folder, "album");
    mkdirSync(album);
    writeFileSync(join(album, "one.png"), "1");
    writeFileSync(join(album, "two.png"), "2");

    const row = getDownloads().find((entry: { file: string }) => entry.file === "album");
    assert.ok(row, "the folder is missing from the listing");
    assert.equal(row.isDirectory, true);
    assert.equal(row.size, 0, "a folder was given a byte size");
    assert.equal(row.itemCount, 2);
    assert.equal(getFileType(row), "Folder");
    assert.equal(getDownloadsCount(), 3);

    rmSync(album, { recursive: true, force: true });
  });

  await check("a real name and a real size read as a type and a size", () => {
    const [image, text] = getDownloads();

    assert.equal(getFileType(image), "PNG");
    assert.equal(getFileType(text), "MD");
    assert.equal(getFileExtension(image.file), "PNG");
    assert.equal(formatFileSize(image.size), `${parseFloat((image.size / 1024).toFixed(2))} KB`);
    assert.equal(isImageFile(image.file), true);
    assert.equal(isImageFile(text.file), false);
    assert.equal(isTextFile(text.file), true);
    assert.equal(isTextFile(image.file), false);
  });

  await check("a row is found by its name, its extension and its size", () => {
    const [image] = getDownloads();
    const words = keywordsFor(image);

    for (const expected of ["nodejs.png", "nodejs", "png", "PNG", "file", formatFileSize(image.size)]) {
      assert.ok(words.includes(expected), `"${expected}" is not among: ${words.join(", ")}`);
    }
  });

  await check("the text preview shows the beginning of the real file, and says it stopped", () => {
    // fs.md is 300 kB against a 10 000-byte cap, so the truncation marker is the
    // difference between "here is the file" and "here is the first tenth of it".
    const preview = getTextFilePreview(textPath);
    const onDisk = readFileSync(textPath, "utf-8");

    assert.match(preview, /^```\w*\n/, "the preview is not a fenced block");
    assert.ok(preview.includes(onDisk.slice(0, 200)), "the preview does not start where the file starts");
    assert.ok(preview.includes("\n…\n```"), "a truncated preview does not admit it was cut");
    assert.ok(preview.length < textBytes.length, "the preview carried the whole document");
  });

  await check("a preview that the platform cannot make is null, not a broken image", async () => {
    // Quick Look is macOS-only; on Linux the honest answer is "no thumbnail".
    const dataUrl = await getQuickLookPreviewDataUrl(imagePath);
    assert.equal(dataUrl, null, "a platform without Quick Look produced a preview");
  });

  await check("revealing a download plans against the file that was downloaded", () => {
    const plan = reveal(imagePath);
    if (plan.kind === "focus") {
      assert.match(plan.selector, /^address:0x[0-9a-fA-F]+$/);
    } else {
      assert.ok(plan.command.includes(imagePath), `the command does not name the file: ${plan.command}`);
    }
  });

  await check("moving a download to the trash keeps the bytes somewhere", async () => {
    const before = getDownloadsCount();
    const result = await moveToTrash(imagePath);

    assert.deepEqual(result.trashedPaths, [imagePath]);
    assert.deepEqual(result.failedPaths, []);
    assert.equal(existsSync(imagePath), false, "the file is still in the folder");

    const trashed = join(trashFiles, "nodejs.png");
    assert.ok(existsSync(trashed), `nothing arrived in ${trashFiles}`);
    assert.deepEqual(readFileSync(trashed), imageBytes, "the trashed bytes are not the downloaded bytes");

    const info = readFileSync(join(trashInfo, "nodejs.png.trashinfo"), "utf-8");
    assert.match(info, /^Path=.*nodejs\.png$/m, `the trashinfo forgot the origin: ${info}`);
    assert.equal(getDownloadsCount(), before - 1, "the count still includes the trashed file");
    assert.ok(
      !getDownloads().some((row: { file: string }) => row.file === "nodejs.png"),
      "the listing still includes the trashed file",
    );
  });

  await check("deleting a download with the trash behaviour moves it, not removes it", async () => {
    await deleteFileOrFolder(textPath, { deletionBehavior: "trash", feedback: "none" });

    assert.equal(existsSync(textPath), false, "the file is still there");
    assert.ok(existsSync(join(trashFiles, "fs.md")), "deleting to trash removed the file forever");
    assert.equal(getDownloadsCount(), 0);
  });

  await check("deleting for good is the only path that leaves nothing behind", async () => {
    const album = join(folder, "album");
    mkdirSync(album);
    writeFileSync(join(album, "inside.png"), "x");

    await deleteFileOrFolder(album, { deletionBehavior: "permaDel", skipConfirmation: true, feedback: "none" });

    assert.equal(existsSync(album), false, "the folder survived a permanent delete");
    assert.equal(existsSync(join(trashFiles, "album")), false, "a permanent delete went to the trash instead");
  });

  await check("the delete behaviour is remembered, and reads back the same way", async () => {
    const first = await toggleDeletionBehavior();
    assert.equal(first, "trash");
    assert.equal(await getDeletionBehavior(), "trash");
    assert.equal(getDeletionBehaviorTitle("trash"), "Trash");

    const second = await toggleDeletionBehavior();
    assert.equal(second, "permaDel");
    assert.equal(await getDeletionBehavior(), "permaDel");
    assert.equal(getDeletionBehaviorTitle("permaDel"), "Permanently Delete");

    // Nothing was permanently deleted through a prompt here, so no answer is recorded.
    assert.equal(await getPermanentDeleteConfirmationChoice(), undefined);
  });

  rmSync(root, { recursive: true, force: true });

  console.log(`\npassed: ${passed}, failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
