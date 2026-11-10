import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { copyIcon, downloadIcon, fetchSiteIcon } from "~/api/icon";
import {
  buildDesktopEntry,
  buildDesktopExec,
  isWebappDesktop,
  normalizeUrl,
  parseEnvFile,
  parseWebappExec,
  readEntryField,
  slugifyName,
  validateName,
  validateUrl,
} from "~/utils/webapp";

const applicationsDir = () => join(homedir(), ".local", "share", "applications");
const iconsDir = () => join(homedir(), ".local", "share", "icons", "hicolor", "256x256", "apps");
const desktopPath = (name: string) => join(applicationsDir(), `${name}.desktop`);

const expandHome = (path: string): string =>
  path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;

export type Result = { ok: boolean; message: string };

const fail = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : String(error) });

const exists = (path: string) => stat(path).then(() => true, () => false);

/** Icon caches are a convenience: a missing tool or a failed refresh is not an error. */
async function refreshCaches(): Promise<void> {
  const quiet = (cmd: string, args: string[]) => new Promise<void>((resolve) => execFile(cmd, args, () => resolve()));
  await Promise.all([
    quiet("gtk-update-icon-cache", [join(homedir(), ".local", "share", "icons", "hicolor")]),
    quiet("update-desktop-database", [applicationsDir()]),
  ]);
}

async function readEnvFile(path: string): Promise<NodeJS.ProcessEnv> {
  if (path.trim() === "") return {};
  try {
    return parseEnvFile(await readFile(expandHome(path.trim()), "utf8"));
  } catch {
    throw new Error(`The environment file ${path} cannot be read`);
  }
}

/**
 * What an Icon field may hold: nothing (the site's own icon), an address, a file
 * on this machine, or the name of a theme icon, which needs no file.
 */
async function installIcon(source: string, slug: string, siteUrl: string, env: NodeJS.ProcessEnv): Promise<string> {
  const dest = join(iconsDir(), `${slug}.png`);
  const trimmed = source.trim();
  await mkdir(iconsDir(), { recursive: true });
  if (trimmed === "") await fetchSiteIcon(siteUrl, dest, env);
  else if (/^https?:\/\//i.test(trimmed)) await downloadIcon(trimmed, dest, env);
  else if (/^[A-Za-z0-9._-]+$/.test(trimmed) && !(await exists(expandHome(trimmed)))) return trimmed;
  else await copyIcon(expandHome(trimmed), dest);
  return slug;
}

export type WebappInput = {
  name: string;
  url: string;
  flags: string;
  icon: string;
  backend: string;
  /** The `Environment File` preference. */
  envFile: string;
  launcherPath: string;
};

const splitFlags = (flags: string): string[] => flags.trim().split(/\s+/).filter(Boolean);

export async function createWebapp(input: WebappInput): Promise<Result> {
  try {
    const name = input.name.trim();
    const url = normalizeUrl(input.url);
    const problem = validateName(name) ?? validateUrl(url);
    if (problem) return { ok: false, message: problem };
    if (await exists(desktopPath(name))) {
      return { ok: false, message: `"${name}" already exists. Edit it from Manage Webapps, or pick another name.` };
    }

    const icon = await installIcon(input.icon, slugifyName(name), url, await readEnvFile(input.envFile));
    const exec = buildDesktopExec(input.launcherPath, input.backend || "auto", url, splitFlags(input.flags));
    await mkdir(applicationsDir(), { recursive: true });
    await writeFile(desktopPath(name), buildDesktopEntry({ name, exec, icon }), { mode: 0o755 });
    await refreshCaches();
    return { ok: true, message: `"${name}" created — it is in the launcher now` };
  } catch (error) {
    return fail(error);
  }
}

export async function listWebapps(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(applicationsDir());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const checked = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".desktop"))
      .map(async (entry) => {
        const content = await readFile(join(applicationsDir(), entry), "utf8").catch(() => "");
        return isWebappDesktop(content) ? entry.slice(0, -".desktop".length) : null;
      }),
  );
  return checked.filter((name): name is string => name !== null).sort();
}

export type WebappConfig = { name: string; url: string; flags: string; icon: string; backend: string };

export async function readWebapp(name: string): Promise<WebappConfig | null> {
  const content = await readFile(desktopPath(name), "utf8").catch(() => null);
  const launch = content === null ? null : parseWebappExec(readEntryField(content, "Exec") ?? "");
  if (content === null || launch === null) return null;
  return {
    name,
    url: launch.url,
    flags: launch.flags.join(" "),
    icon: readEntryField(content, "Icon") ?? "",
    backend: launch.backend,
  };
}

export async function updateWebapp(
  oldName: string,
  next: WebappConfig & { envFile: string; launcherPath: string },
): Promise<Result> {
  try {
    const before = await readWebapp(oldName);
    if (!before) return { ok: false, message: `"${oldName}" is not a web app` };
    const name = next.name.trim();
    const url = normalizeUrl(next.url);
    const problem = validateName(name) ?? validateUrl(url);
    if (problem) return { ok: false, message: problem };
    if (name !== oldName && (await exists(desktopPath(name)))) {
      return { ok: false, message: `"${name}" already exists` };
    }

    let icon = next.icon.trim();
    if (icon !== before.icon) {
      icon = await installIcon(icon, slugifyName(name), url, await readEnvFile(next.envFile));
    } else if (name !== oldName && icon === slugifyName(oldName)) {
      // The icon file is named after the app; it follows a rename so that removing the app finds it.
      const from = join(iconsDir(), `${icon}.png`);
      icon = slugifyName(name);
      if (await exists(from)) await rename(from, join(iconsDir(), `${icon}.png`));
    }

    const exec = buildDesktopExec(next.launcherPath, next.backend || "auto", url, splitFlags(next.flags));
    await writeFile(desktopPath(name), buildDesktopEntry({ name, exec, icon }), { mode: 0o755 });
    await chmod(desktopPath(name), 0o755);
    if (name !== oldName) await rm(desktopPath(oldName));
    await refreshCaches();
    return { ok: true, message: `"${name}" updated` };
  } catch (error) {
    return fail(error);
  }
}

export async function removeWebapp(name: string): Promise<Result> {
  try {
    const problem = validateName(name);
    if (problem) return { ok: false, message: problem };
    const app = await readWebapp(name);
    if (!app) return { ok: false, message: `"${name}" is not a web app` };

    await rm(desktopPath(name));
    const icons = new Set([slugifyName(name), app.icon].filter((icon) => /^[A-Za-z0-9._-]+$/.test(icon)));
    await Promise.all([...icons].map((icon) => rm(join(iconsDir(), `${icon}.png`), { force: true })));
    await refreshCaches();
    return { ok: true, message: `"${name}" removed` };
  } catch (error) {
    return fail(error);
  }
}
