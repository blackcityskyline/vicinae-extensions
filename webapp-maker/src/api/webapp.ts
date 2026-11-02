import { mkdir, writeFile, copyFile, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { getApplicationsDir, getIconsDir, slugifyName, desktopStringEscape, buildDesktopExec, isWebappDesktop } from "~/utils/webapp";
import { ensureLauncher } from "~/api/launcher";
import { downloadIcon, fetchSiteIcon, type IconSource } from "~/api/icon";
import { spawn } from "node:child_process";

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export type CreateWebappOptions = {
  name: string;
  url: string;
  flags: string;
  icon: string;
  browserBackend: string;
};

export type CreateWebappResult = {
  ok: boolean;
  message: string;
};

function desktopStringEscape2(value: string): string {
  return desktopStringEscape(value);
}

export async function createWebapp(options: CreateWebappOptions): Promise<CreateWebappResult> {
  const appName = options.name.trim();
  if (appName === "") return { ok: false, message: "Name is required" };
  if (appName.includes("/")) return { ok: false, message: "Name cannot contain \"/\"" };

  let appUrl = options.url.trim();
  if (appUrl === "") return { ok: false, message: "URL is required" };
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(appUrl)) {
    appUrl = "https://" + appUrl;
  }
  if (/\s/.test(appUrl)) return { ok: false, message: "URL must not contain whitespace" };
  if (!/^https?:\/\//i.test(appUrl)) return { ok: false, message: "URL must be http or https" };

  const backend = options.browserBackend.trim() === "" || options.browserBackend === "auto" ? "auto" : options.browserBackend.trim();

  const appsDir = getApplicationsDir();
  const iconsDir = getIconsDir();
  await mkdir(appsDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  const launcherPath = await ensureLauncher();

  const iconValue = slugifyName(appName);
  const iconSourceRaw = options.icon.trim();
  const iconSource = expandHome(iconSourceRaw) as IconSource;
  if (iconSourceRaw === "") {
    try {
      await fetchSiteIcon(appUrl, join(iconsDir, iconValue + ".png"));
    } catch (e) {
      return { ok: false, message: "Could not download an icon for " + appUrl };
    }
  } else if (/^https?:\/\//i.test(iconSourceRaw)) {
    try {
      await downloadIcon(iconSourceRaw, join(iconsDir, iconValue + ".png"));
    } catch (e) {
      return { ok: false, message: "Could not download the icon" };
    }
  } else {
    try {
      await copyFile(iconSource, join(iconsDir, iconValue + ".png"));
    } catch (e) {
      try {
        await downloadIcon(iconSourceRaw, join(iconsDir, iconValue + ".png"));
      } catch (e2) {
        return { ok: false, message: "Could not use the icon" };
      }
    }
  }

  try {
    spawn("gtk-update-icon-cache", [join(homedir(), ".local", "share", "icons", "hicolor")], { stdio: "ignore" });
  } catch {}

  const flagStr = options.flags.trim();
  const flags = flagStr === "" ? [] : flagStr.split(/\s+/).filter(Boolean);
  const execCommand = buildDesktopExec(launcherPath, backend, appUrl, flags);

  const desktopFile = join(appsDir, appName + ".desktop");
  const nameField = desktopStringEscape2(appName);
  const execField = desktopStringEscape2(execCommand);
  const iconField = desktopStringEscape2(iconValue);

  const content = `[Desktop Entry]
Version=1.0
Name=${nameField}
Comment=${nameField}
Exec=${execField}
Terminal=false
Type=Application
Icon=${iconField}
StartupNotify=true
`;
  await writeFile(desktopFile, content, { mode: 0o755 });
  try {
    spawn("update-desktop-database", [appsDir], { stdio: "ignore" });
  } catch {}

  return { ok: true, message: '"' + appName + '" created — it is in the launcher now' };
}

export async function listWebapps(): Promise<string[]> {
  const appsDir = getApplicationsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(appsDir);
  } catch {
    return [];
  }
  const apps: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".desktop")) continue;
    const full = join(appsDir, entry);
    try {
      const content = await readFile(full, "utf8");
      if (isWebappDesktop(content)) {
        apps.push(entry.replace(/\.desktop$/, ""));
      }
    } catch {}
  }
  apps.sort();
  return apps;
}

export async function removeWebapp(name: string): Promise<CreateWebappResult> {
  const appName = name.trim();
  if (appName === "") return { ok: false, message: "Name required" };
  const appsDir = getApplicationsDir();
  const iconsDir = getIconsDir();
  const desktopFile = join(appsDir, appName + ".desktop");
  try {
    const content = await readFile(desktopFile, "utf8");
    if (!isWebappDesktop(content)) {
      return { ok: false, message: "Not a web app: " + appName };
    }
  } catch {
    return { ok: false, message: "Not a web app: " + appName };
  }
  const iconName = slugifyName(appName);
  try { await unlink(desktopFile); } catch {}
  try { await unlink(join(iconsDir, iconName + ".png")); } catch {}
  try { await unlink(join(iconsDir, appName + ".png")); } catch {}
  try {
    spawn("update-desktop-database", [appsDir], { stdio: "ignore" });
  } catch {}
  return { ok: true, message: '"' + appName + '" removed' };
}
