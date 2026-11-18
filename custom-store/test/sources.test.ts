import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { loadSources } from "../src/api/repository.ts";

/**
 * `loadSources` is the part of the store that cannot be seen in a type: which
 * directory counts as a bundle, what one broken source does to the rest, and
 * whether a Git source is cloned once and pulled only on Refresh. Fixtures on
 * disk answer that without a launcher; nothing here touches the network.
 */

const execFileAsync = promisify(execFile);

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void>) {
  try {
    await body();
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

async function writeBundle(dir: string, name: string, title: string) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name,
      title,
      description: `${title} does something.`,
      commands: [{ name, title, description: `${title} runs.` }],
    }),
  );
  await fs.writeFile(join(dir, `${name}.js`), "module.exports = {};\n");
}

async function commit(repo: string, message: string) {
  await execFileAsync("git", ["-C", repo, "add", "-A"]);
  await execFileAsync("git", [
    "-C", repo,
    "-c", "user.email=fixture@local",
    "-c", "user.name=fixture",
    "commit", "-qm", message,
  ]);
}

async function main() {
  const root = await fs.mkdtemp(join(tmpdir(), "custom-store-test-"));
  const dataHome = join(root, "data");
  const cacheHome = join(root, "cache");
  const folder = join(root, "folder");
  const repo = join(root, "repo");

  // The store looks installed ids up here and clones into here.
  process.env.XDG_DATA_HOME = dataHome;
  process.env.XDG_CACHE_HOME = cacheHome;

  await fs.mkdir(join(dataHome, "vicinae", "extensions", "installed-one"), { recursive: true });
  await writeBundle(join(folder, "alpha"), "alpha", "Alpha");
  // An extension project: a manifest, but nothing Vicinae can run.
  await fs.mkdir(join(folder, "project"), { recursive: true });
  await fs.writeFile(
    join(folder, "project", "package.json"),
    JSON.stringify({ name: "project", title: "Project", description: "Sources.", commands: [] }),
  );

  await fs.mkdir(repo, { recursive: true });
  await writeBundle(join(repo, "beta"), "beta", "Beta");
  await execFileAsync("git", ["init", "-q", repo]);
  await commit(repo, "beta");
  const remote = pathToFileURL(repo).toString();

  await check("one source: every child with a manifest is a row", async () => {
    const { entries, failures } = await loadSources([folder]);
    assert.deepEqual(failures, []);
    assert.deepEqual(
      entries.map((entry) => `${entry.id}:${entry.installed}`),
      ["alpha:false", "project:false"],
    );
    assert.equal(entries[0]?.repository, folder);
    assert.equal(entries[0]?.origin, join(folder, "alpha"));
  });

  await check("installed means a directory of that name under extensions", async () => {
    const installed = join(root, "installed-folder");
    await writeBundle(join(installed, "installed-one"), "installed-one", "Installed One");
    const { entries } = await loadSources([installed]);
    assert.equal(entries[0]?.id, "installed-one");
    assert.equal(entries[0]?.installed, true);
  });

  await check("the sources are summed, deduplicated by id and sorted by title", async () => {
    await writeBundle(join(folder, "gamma"), "gamma", "Gamma");
    await writeBundle(join(folder, "alpha-again"), "alpha", "Alpha Again");
    const { entries, failures } = await loadSources([folder, remote]);
    assert.deepEqual(failures, []);
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["alpha", "beta", "gamma", "project"],
    );
    assert.equal(
      entries[0]?.origin,
      join(folder, "alpha"),
      "the source read first provides the row for a duplicate id",
    );

    const beta = entries.find((entry) => entry.id === "beta");
    assert.equal(beta?.repository, remote, "a clone names the repository, not the cache");
    assert.ok(beta?.origin.startsWith(join(cacheHome, "custom-store")), "and installs from the clone");
    assert.ok(beta?.origin.endsWith("/beta"));
  });

  await check("a source that cannot be read does not hide the others", async () => {
    const { entries, failures } = await loadSources([folder, join(root, "missing")]);
    assert.equal(entries.length, 3);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.source, join(root, "missing"));
    assert.match(failures[0]?.message ?? "", /ENOENT/);
  });

  await check("a clone is read from the cache until a refresh pulls", async () => {
    await writeBundle(join(repo, "delta"), "delta", "Delta");
    await commit(repo, "delta");

    const cached = await loadSources([remote]);
    assert.deepEqual(
      cached.entries.map((entry) => entry.id),
      ["beta"],
      "opening the store does not touch the network",
    );

    const refreshed = await loadSources([remote], true);
    assert.deepEqual(
      refreshed.entries.map((entry) => entry.id),
      ["beta", "delta"],
    );
  });

  await check("a repository that cannot be cloned is a failure with git's own words", async () => {
    const { entries, failures } = await loadSources([pathToFileURL(join(root, "no-repo")).toString()]);
    assert.deepEqual(entries, []);
    assert.equal(failures.length, 1);
    assert.match(failures[0]?.message ?? "", /git clone failed/);
  });

  await fs.rm(root, { recursive: true, force: true });
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
