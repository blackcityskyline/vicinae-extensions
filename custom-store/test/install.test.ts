import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPackage } from "../src/api/repository.ts";
import type { PackageEntry } from "../src/utils/repository.ts";

/**
 * Install has two shapes: a built bundle is copied, a source tree is built the
 * way its own `build` script says. Both must end with a runnable directory under
 * `extensions/`; a failed build must leave nothing behind. Fixtures run `node`
 * instead of `vici build`, so no network and no real launcher are involved.
 */

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

function entry(id: string, origin: string): PackageEntry {
  return {
    id,
    title: id,
    description: "Fixture.",
    categories: [],
    platforms: [],
    commands: [],
    source: "local",
    origin,
    installed: false,
  };
}

async function manifest(dir: string, name: string, build?: string) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name,
      title: name,
      description: `${name} does something.`,
      commands: [{ name, title: name, description: `${name} runs.` }],
      scripts: build ? { build } : undefined,
    }),
  );
}

/** A project: manifest and source, no compiled entrypoint next to it. */
async function project(root: string, name: string, fail = false): Promise<string> {
  const dir = join(root, name);
  await manifest(dir, name, "node build.js");
  // npm must not try to fetch anything: an empty node_modules is enough.
  await fs.mkdir(join(dir, "node_modules"), { recursive: true });
  await fs.writeFile(
    join(dir, "build.js"),
    fail
      ? `console.error("boom: cannot compile"); process.exit(1);\n`
      : `const fs = require("node:fs");\n` +
          `const path = require("node:path");\n` +
          `const target = path.join(process.env.XDG_DATA_HOME, "vicinae", "extensions", ${JSON.stringify(name)});\n` +
          `fs.mkdirSync(target, { recursive: true });\n` +
          `fs.writeFileSync(path.join(target, ${JSON.stringify(`${name}.js`)}), "module.exports = {};\\n");\n` +
          `fs.copyFileSync(path.join(__dirname, "package.json"), path.join(target, "package.json"));\n`,
  );
  return dir;
}

/** A build output: manifest and compiled entrypoint, maybe a `.git` from a clone. */
async function bundle(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await manifest(dir, name);
  await fs.writeFile(join(dir, `${name}.js`), "module.exports = {};\n");
  await fs.mkdir(join(dir, ".git"), { recursive: true });
  await fs.writeFile(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  return dir;
}

async function main() {
  const root = await fs.mkdtemp(join(tmpdir(), "custom-store-install-"));
  const dataHome = join(root, "data");
  const extensions = join(dataHome, "vicinae", "extensions");
  process.env.XDG_DATA_HOME = dataHome;

  await check("a source tree is built with its own build script", async () => {
    const origin = await project(root, "built-here");
    const messages: string[] = [];
    await installPackage(entry("built-here", origin), (message) => messages.push(message));

    const target = join(extensions, "built-here");
    assert.ok(await fs.readdir(target), "the build script wrote the extension");
    assert.ok(messages.some((message) => message.includes("Building")), "progress was reported");
  });

  await check("a built bundle is copied and its .git is left behind", async () => {
    const origin = await bundle(root, "copied-bundle");
    await installPackage(entry("copied-bundle", origin));

    const target = join(extensions, "copied-bundle");
    assert.ok((await fs.stat(join(target, "copied-bundle.js"))).isFile());
    await assert.rejects(fs.stat(join(target, ".git")), /ENOENT/);
  });

  await check("a failed build installs nothing and says why", async () => {
    const origin = await project(root, "broken-build", true);
    await assert.rejects(
      installPackage(entry("broken-build", origin)),
      (error: Error) => {
        assert.match(error.message, /npm run build failed/);
        assert.match(error.message, /boom/);
        return true;
      },
    );
    await assert.rejects(fs.stat(join(extensions, "broken-build")), /ENOENT/);
  });

  await fs.rm(root, { recursive: true, force: true });
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
