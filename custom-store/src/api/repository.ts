import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  expandHome,
  indexUrl,
  mergeEntries,
  sourceKind,
  isSafeId,
  manifestEntry,
  parseIndex,
  type PackageEntry,
  type SourceFailure,
  type SourcesResult,
} from "../utils/repository";

const execFileAsync = promisify(execFile);

/** Where Vicinae looks for user-installed extensions (`Omnicast::dataSearchPaths`). */
export function extensionsDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataHome, "vicinae", "extensions");
}

export function supportDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(dataHome, "vicinae", "support");
}

export async function installedIds(): Promise<Set<string>> {
  try {
    const children = await fs.readdir(extensionsDir(), { withFileTypes: true });
    return new Set(
      children
        .filter((child) => child.isDirectory() && !child.name.startsWith("."))
        .map((child) => child.name),
    );
  } catch {
    return new Set();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/** The manifest names `icon.png`, the bundle keeps it under `assets/`. */
async function bundleIcon(dir: string, icon: unknown): Promise<string | undefined> {
  if (typeof icon !== "string" || icon.length === 0) return undefined;
  for (const candidate of [join(dir, "assets", icon), join(dir, icon)]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try the next location
    }
  }
  return undefined;
}

/**
 * `vici build` leaves a compiled entrypoint next to the manifest. A directory
 * of sources, such as a clone of an extension repository, has the manifest and
 * the same commands but nothing to run, so installing it would produce an
 * extension Vicinae cannot start. Such a directory is not a bundle.
 */
async function isBuiltBundle(dir: string, manifest: unknown): Promise<boolean> {
  const commands = (manifest as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(commands) || commands.length === 0) return false;

  for (const command of commands) {
    const name = (command as { name?: unknown } | null)?.name;
    if (typeof name !== "string") return false;
    try {
      await fs.access(join(dir, `${name}.js`));
    } catch {
      return false;
    }
  }
  return true;
}

async function loadLocalRepository(
  source: string,
  installed: Set<string>,
): Promise<PackageEntry[]> {
  const dir = expandHome(source, homedir());
  const children = await fs.readdir(dir, { withFileTypes: true });
  const entries: PackageEntry[] = [];

  for (const child of children) {
    if (!child.isDirectory() || child.name.startsWith(".")) continue;

    const bundle = join(dir, child.name);
    try {
      const manifest = JSON.parse(await fs.readFile(join(bundle, "package.json"), "utf8"));
      if (!(await isBuiltBundle(bundle, manifest))) continue;

      const entry = manifestEntry(
        manifest,
        { dir: bundle, icon: await bundleIcon(bundle, manifest.icon) },
        installed.has(String(manifest.name)),
      );
      if (entry) entries.push({ ...entry, repository: source });
    } catch (error) {
      console.warn(`custom-store: ${basename(bundle)} is not a built extension:`, error);
    }
  }

  return entries;
}

async function loadIndexRepository(
  source: string,
  installed: Set<string>,
): Promise<PackageEntry[]> {
  const url = indexUrl(source);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  return parseIndex(await response.text(), url).map((entry) => ({
    ...entry,
    repository: source,
    installed: installed.has(entry.id),
  }));
}

async function isBundle(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(join(dir, "package.json"))).isFile();
  } catch {
    return false;
  }
}

function cacheRoot(): string {
  const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(cacheHome, "custom-store");
}

/** `~/.cache/custom-store/<hash>`: one shallow clone per repository URL. */
function checkoutDir(source: string): string {
  const key = createHash("sha1").update(source.trim()).digest("hex").slice(0, 12);
  return join(cacheRoot(), key);
}

/** The last stderr line is the one that names the problem. */
function commandError(error: unknown): string {
  const failure = error as { stderr?: unknown; message?: unknown } | null;
  const text =
    typeof failure?.stderr === "string" && failure.stderr.trim().length > 0
      ? failure.stderr
      : String(failure?.message ?? error);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[lines.length - 1] ?? text.trim();
}

function git(args: string[], timeout: number) {
  return execFileAsync("git", args, {
    timeout,
    // A private repository must fail instead of waiting for a password nobody
    // can type: the launcher has no terminal attached.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/**
 * A repository is cloned once and read from the cache on every later launch;
 * only Refresh pulls. Nothing here runs on a timer: an idle launcher makes no
 * network calls and keeps no process.
 */
async function checkout(
  source: string,
  refresh: boolean,
): Promise<{ dir: string; failure?: string }> {
  const dir = checkoutDir(source);

  if (!(await exists(join(dir, ".git")))) {
    await fs.mkdir(dirname(dir), { recursive: true });
    await fs.rm(dir, { recursive: true, force: true });
    try {
      await git(["clone", "--depth", "1", "--quiet", source.trim(), dir], 180_000);
    } catch (error) {
      await fs.rm(dir, { recursive: true, force: true });
      throw new Error(`git clone failed: ${commandError(error)}`);
    }
    return { dir };
  }

  if (!refresh) return { dir };

  try {
    await git(["-C", dir, "pull", "--ff-only", "--quiet"], 120_000);
    return { dir };
  } catch (error) {
    // The stale clone still lists what it listed the last time; the failure is
    // worth saying out loud, but it should not empty the store.
    return { dir, failure: `git pull failed, showing the cached copy: ${commandError(error)}` };
  }
}

type SourceRead = {
  entries: PackageEntry[];
  failure?: string;
};

async function readSource(
  source: string,
  installed: Set<string>,
  refresh: boolean,
): Promise<SourceRead> {
  const kind = sourceKind(source);

  if (kind === "index") {
    return { entries: await loadIndexRepository(source, installed) };
  }

  if (kind === "git") {
    const { dir, failure } = await checkout(source, refresh);
    const entries = await loadLocalRepository(dir, installed);
    return { entries: entries.map((entry) => ({ ...entry, repository: source })), failure };
  }

  return { entries: await loadLocalRepository(source, installed) };
}

/** Every source is read at once; one that fails does not hide the others. */
export async function loadSources(
  sources: string[],
  refresh = false,
): Promise<SourcesResult> {
  const installed = await installedIds();
  const unique = [
    ...new Set(sources.map((source) => source.trim()).filter((source) => source.length > 0)),
  ];
  const results = await Promise.allSettled(
    unique.map((source) => readSource(source, installed, refresh)),
  );

  const entries: PackageEntry[] = [];
  const failures: SourceFailure[] = [];

  results.forEach((result, index) => {
    const source = unique[index];
    if (source === undefined) return;

    if (result.status === "fulfilled") {
      entries.push(...result.value.entries);
      if (result.value.failure) failures.push({ source, message: result.value.failure });
      return;
    }
    failures.push({ source, message: commandError(result.reason) });
  });

  return { entries: mergeEntries(entries), failures };
}

/**
 * Everything lands through `.staging-<id>` and is renamed into place afterwards,
 * like `ExtensionRegistry::installFromZip`: a half-copied or half-extracted
 * package never becomes visible, because the registry rescans 100 ms after any
 * change in `extensions/`.
 */
async function stagingDir(id: string): Promise<string> {
  const staging = join(extensionsDir(), `.staging-${id}`);
  await fs.rm(staging, { recursive: true, force: true });
  return staging;
}

async function promote(staging: string, id: string): Promise<void> {
  const target = join(extensionsDir(), id);
  if (!(await isBundle(staging))) {
    await fs.rm(staging, { recursive: true, force: true });
    throw new Error("The package has no package.json at its root.");
  }
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(staging, target);
}

/** The archive holds one root folder; the registry strips that component too. */
async function archiveRoot(staging: string): Promise<string> {
  if (await isBundle(staging)) return staging;
  for (const child of await fs.readdir(staging, { withFileTypes: true })) {
    const dir = join(staging, child.name);
    if (child.isDirectory() && (await isBundle(dir))) return dir;
  }
  throw new Error("The archive has no package.json at its root.");
}

async function installArchive(url: string, id: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  const archive = join(tmpdir(), `custom-store-${id}.zip`);
  const staging = await stagingDir(id);
  try {
    await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));
    await execFileAsync("unzip", ["-q", "-o", archive, "-d", staging], { timeout: 60_000 });
    await promote(await archiveRoot(staging), id);
  } finally {
    await fs.rm(archive, { force: true });
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export async function installPackage(entry: PackageEntry): Promise<void> {
  if (!isSafeId(entry.id)) throw new Error(`"${entry.id}" is not a usable extension id`);

  if (entry.source === "remote") return installArchive(entry.origin, entry.id);

  const staging = await stagingDir(entry.id);
  // A bundle cloned from a repository still carries its `.git` directory.
  await fs.cp(entry.origin, staging, {
    recursive: true,
    filter: (path) => basename(path) !== ".git",
  });
  await promote(staging, entry.id);
}

/** What `ExtensionRegistry::uninstall` removes, minus its private storage. */
export async function removeExtension(id: string): Promise<void> {
  if (!isSafeId(id)) throw new Error(`"${id}" is not a usable extension id`);
  await fs.rm(join(extensionsDir(), id), { recursive: true, force: true });
  await fs.rm(join(supportDir(), id), { recursive: true, force: true });
}
