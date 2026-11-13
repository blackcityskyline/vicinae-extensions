import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  expandHome,
  indexUrl,
  isRemoteSource,
  isSafeId,
  manifestEntry,
  parseIndex,
  type PackageEntry,
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

async function loadLocalRepository(source: string): Promise<PackageEntry[]> {
  const dir = expandHome(source, homedir());
  const children = await fs.readdir(dir, { withFileTypes: true });
  const installed = await installedIds();
  const entries: PackageEntry[] = [];

  for (const child of children) {
    if (!child.isDirectory() || child.name.startsWith(".")) continue;

    const bundle = join(dir, child.name);
    try {
      const manifest = JSON.parse(await fs.readFile(join(bundle, "package.json"), "utf8"));
      const entry = manifestEntry(
        manifest,
        { dir: bundle, icon: await bundleIcon(bundle, manifest.icon) },
        installed.has(String(manifest.name)),
      );
      if (entry) entries.push(entry);
    } catch (error) {
      console.warn(`custom-store: ${basename(bundle)} is not a built extension:`, error);
    }
  }

  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadRepository(source: string): Promise<PackageEntry[]> {
  if (!isRemoteSource(source)) return loadLocalRepository(source);

  const url = indexUrl(source);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  const installed = await installedIds();
  return parseIndex(await response.text(), url)
    .map((entry) => ({ ...entry, installed: installed.has(entry.id) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function isBundle(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(join(dir, "package.json"))).isFile();
  } catch {
    return false;
  }
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
  await fs.cp(entry.origin, staging, { recursive: true });
  await promote(staging, entry.id);
}

/** What `ExtensionRegistry::uninstall` removes, minus its private storage. */
export async function removeExtension(id: string): Promise<void> {
  if (!isSafeId(id)) throw new Error(`"${id}" is not a usable extension id`);
  await fs.rm(join(extensionsDir(), id), { recursive: true, force: true });
  await fs.rm(join(supportDir(), id), { recursive: true, force: true });
}
