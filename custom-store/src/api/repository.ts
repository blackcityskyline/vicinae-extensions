import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  expandHome,
  indexUrl,
  isRemoteSource,
  manifestEntry,
  parseIndex,
  type PackageEntry,
} from "../utils/repository";

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
