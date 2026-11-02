import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Category } from "~/utils/categories";
import { parseDesktopEntry, summarizeDefaults, type DesktopApp } from "~/utils/desktop";

const run = promisify(execFile);

export class XdgMimeMissing extends Error {
  constructor() {
    super("xdg-mime was not found. Install xdg-utils.");
  }
}

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;

/** `xdg-mime`'s stdout, with "not installed" told apart from "failed". */
async function xdgMime(args: string[]): Promise<string> {
  try {
    return (await run("xdg-mime", args)).stdout.trim();
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new XdgMimeMissing();
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || `xdg-mime ${args.join(" ")} failed`);
  }
}

/** A missing or unreadable directory is normal on any one system; nothing else is. */
const ABSENT = new Set(["ENOENT", "ENOTDIR", "EACCES"]);

/**
 * Every application in `dirs`. A desktop file in an earlier directory hides one
 * of the same name in a later one, as the XDG specification says.
 */
export async function readDesktopApps(dirs: readonly string[]): Promise<DesktopApp[]> {
  const files = new Map<string, string>();
  const listings = await Promise.all(
    dirs.map(async (dir) => {
      try {
        return { dir, names: await readdir(dir) };
      } catch (error) {
        if (ABSENT.has(errorCode(error) ?? "")) return { dir, names: [] };
        throw error;
      }
    }),
  );
  for (const { dir, names } of listings) {
    for (const name of names.sort()) {
      if (name.endsWith(".desktop") && !files.has(name)) files.set(name, join(dir, name));
    }
  }

  const apps = await Promise.all(
    [...files].map(async ([id, path]) => {
      try {
        return parseDesktopEntry(id, await readFile(path, "utf8"));
      } catch (error) {
        // A dangling symlink is a leftover, not a failure.
        if (ABSENT.has(errorCode(error) ?? "")) return null;
        throw error;
      }
    }),
  );
  return apps.filter((app): app is DesktopApp => app !== null);
}

const queryDefault = async (mime: string): Promise<string | null> =>
  (await xdgMime(["query", "default", mime])) || null;

/** What every type of the category currently answers. */
export async function queryCategory(category: Category) {
  return summarizeDefaults(await Promise.all(category.mimes.map(queryDefault)));
}

/**
 * Makes `appId` the default for every type of the category, and reads the answer
 * back: `xdg-mime default` exits 0 even for an application that does not exist
 * (it writes the name into `mimeapps.list` regardless), so its exit status
 * proves nothing.
 */
export async function setDefault(category: Category, appId: string): Promise<void> {
  await xdgMime(["default", appId, ...category.mimes]);
  const { id, mixed } = await queryCategory(category);
  if (id !== appId || mixed) {
    throw new Error(`xdg-mime accepted ${appId}, but ${category.title} still reports ${mixed ? "mixed answers" : (id ?? "no default")}.`);
  }
}
