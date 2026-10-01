import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// tsx runs this file as CommonJS, so there is no top-level await: the environment is
// set up and the module imported inside main().
const trashedFiles = () => join(process.env.XDG_DATA_HOME as string, "Trash", "files");

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

let home = "";

function sample(name: string, content = "not empty"): string {
  const path = join(home, "Downloads", name);
  writeFileSync(path, content);
  return path;
}

async function main() {
  // A home of its own, so a real trash run touches nothing of the user's. Set before the
  // import because gio reads HOME to decide where the trash is.
  home = mkdtempSync(join(tmpdir(), "dl-trash-home-"));
  process.env.XDG_DATA_HOME = join(home, ".local", "share");
  process.env.HOME = home;
  mkdirSync(join(home, "Downloads"), { recursive: true });

  const { trashEach, trashOnLinux } = await import("../src/trash.ts");

  await check("a trashed file is still readable somewhere", async () => {
    const path = sample("kept.txt");

    await trashOnLinux(path);

    assert.equal(existsSync(path), false, "the file is still where it was");

    // The point of a trash. Vicinae's own trash() is rm -r, so this is the check that
    // catches it: the bytes have to exist in a trash directory afterwards.
    assert.ok(existsSync(trashedFiles()), `no trash directory at ${trashedFiles()}`);
    assert.ok(existsSync(join(trashedFiles(), "kept.txt")), "nothing arrived in the trash");
    assert.equal(readFileSync(join(trashedFiles(), "kept.txt"), "utf-8"), "not empty");
  });

  await check("the trashinfo records where the file came from", async () => {
    const path = sample("where-from.txt");

    await trashOnLinux(path);

    // The name and the original path: a trashed file that cannot be told apart from
    // another kept.txt, or put back where it came from, is data loss with extra steps.
    const info = join(process.env.XDG_DATA_HOME as string, "Trash", "info", "where-from.txt.trashinfo");
    assert.ok(existsSync(info), "no trashinfo");
    const text = readFileSync(info, "utf-8");
    assert.match(text, /^Path=/m);
    assert.match(text, /^DeletionDate=/m);
    assert.ok(text.includes("where-from.txt"), `original path missing: ${text}`);
  });

  await check("a directory goes to the trash whole, contents and all", async () => {
    const dir = join(home, "Downloads", "folder");
    mkdirSync(dir);
    writeFileSync(join(dir, "inside.txt"), "child");

    await trashOnLinux(dir);

    assert.equal(existsSync(dir), false);
    const inside = join(trashedFiles(), "folder", "inside.txt");
    assert.ok(existsSync(inside), "the directory arrived empty");
    assert.equal(readFileSync(inside, "utf-8"), "child");
  });

  await check("two files of the same name both survive", async () => {
    // Not a corner case: a downloads folder is full of file(1).zip.
    await trashOnLinux(sample("dup.zip", "one"));
    await trashOnLinux(sample("dup.zip", "two"));

    const contents = existsSync(trashedFiles()) ? readdirSync(trashedFiles()) : [];
    assert.ok(contents.length >= 2, `the second overwrote the first: ${contents.join(", ")}`);
  });

  await check("a name with a quote and a semicolon stays a name", async () => {
    const name = `it's "quoted"; rm -rf $HOME.txt`;
    await trashOnLinux(sample(name, "x"));

    assert.ok(existsSync(join(trashedFiles(), name)), "the file did not arrive under its own name");
    assert.equal(existsSync(join(home, ".txt")), false, "a shell ran");
    assert.equal(existsSync(join(home, "Downloads", name)), false);
  });

  await check("a path that is not there is an error, not a silent success", async () => {
    const gone = join(home, "Downloads", "never-existed.txt");

    await assert.rejects(
      () => trashOnLinux(gone),
      (error: unknown) => {
        assert.match(String(error), /never-existed|no such|not found|enoent/i);
        return true;
      },
    );
  });

  await check("an empty list does nothing and does not throw", async () => {
    await trashOnLinux([]);
    assert.deepEqual(await trashEach([]), { trashed: [], failed: [] });
  });

  await check("a batch reports each path by what actually happened", async () => {
    // "Delete All Downloads" drops the trashed rows from the list and says how many did
    // not go. Deciding that by checking afterwards whether the path is still there gets
    // this wrong twice: a path that was never there reads as trashed, and a path that a
    // concurrent process removed reads as trashed too.
    const real = sample("batch-ok.txt", "b");
    const neverThere = join(home, "Downloads", "never-existed.txt");

    const { trashed, failed } = await trashEach([real, neverThere]);

    assert.deepEqual(trashed, [real], "the file that went is not the one reported");
    assert.deepEqual(
      failed.map((entry) => entry.path),
      [neverThere],
      "the path that did not exist was reported as trashed",
    );
    assert.ok(failed[0]?.reason.length > 0, "no reason given for the failure");
  });

  await check("every path in a batch is attempted even after one is refused", async () => {
    const first = sample("batch-a.txt", "a");
    const second = sample("batch-b.txt", "b");
    const missing = join(home, "Downloads", "missing.txt");

    const { trashed } = await trashEach([first, missing, second]);

    assert.deepEqual(trashed.sort(), [first, second].sort(), "one call stopped the rest");
  });

  await check("a refusal names the file instead of failing blank", async () => {
    // Verified on this machine: gio refuses a system-internal mount with
    // "Trashing on system internal mounts is not supported". tmpfs may or may not be
    // treated that way, so both answers are accepted — what is checked is that the
    // message says which file and why.
    const somewhere = join(mkdtempSync(join(tmpdir(), "dl-elsewhere-")), "file.txt");
    writeFileSync(somewhere, "x");

    try {
      await trashOnLinux(somewhere);
    } catch (error) {
      const text = String(error);
      assert.ok(text.includes("file.txt"), `the path is missing from: ${text}`);
      assert.ok(text.length > 40, `no reason given: ${text}`);
      return;
    }

    assert.equal(existsSync(somewhere), false, "gio reported success but the file is still there");
  });

  rmSync(home, { recursive: true, force: true });
  console.log(`\nall ${checks} checks passed`);
}

main().catch((error: unknown) => {
  console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
