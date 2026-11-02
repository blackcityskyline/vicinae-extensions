import { readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getApplicationsDir } from "~/utils/webapp";
import { getLauncherPath } from "~/api/launcher";
import { spawn } from "node:child_process";

export type WebappConfig = {
  name: string;
  url: string;
  flags: string;
  icon: string;
  backend: string;
};

export async function readWebappConfig(name: string): Promise<WebappConfig | null> {
  const appsDir = getApplicationsDir();
  const desktopFile = join(appsDir, name + ".desktop");
  try {
    const content = await readFile(desktopFile, "utf8");
    if (!/^Exec=.*webapp-launch/m.test(content)) return null;
    const urlMatch = content.match(/Exec=.*webapp-launch[^\"]*\"([^\"]+)\"[^\"]*$/m);
    let url = "";
    if (urlMatch && urlMatch[1]) {
      url = urlMatch[1];
    } else {
      const urlMatch2 = content.match(/webapp-launch.*?(https?:\/\/\S+)/);
      if (urlMatch2 && urlMatch2[1]) url = urlMatch2[1];
    }
    const backendMatch = content.match(/--backend\s+\"([^\"]+)\"/);
    const backend = backendMatch && backendMatch[1] ? backendMatch[1] : "auto";
    const iconMatch = content.match(/^Icon=(.+)$/m);
    const icon = iconMatch && iconMatch[1] ? iconMatch[1].trim() : "";
    return { name, url, flags: "", icon, backend };
  } catch {
    return null;
  }
}

export async function updateWebappConfig(config: WebappConfig, oldName?: string): Promise<{ ok: boolean; message: string }> {
  const appsDir = getApplicationsDir();
  const sourceName = oldName || config.name;
  const sourceFile = join(appsDir, sourceName + ".desktop");
  try {
    const content = await readFile(sourceFile, "utf8");
    if (!/^Exec=.*webapp-launch/m.test(content)) {
      return { ok: false, message: "Not a web app" };
    }
  } catch {
    return { ok: false, message: "Web app not found" };
  }
  if (config.name !== sourceName) {
    if (config.name.includes("/")) return { ok: false, message: "Name cannot contain \"/\"" };
    const destFile = join(appsDir, config.name + ".desktop");
    try {
      await stat(destFile);
      return { ok: false, message: "Web app with that name already exists" };
    } catch {}
  }
  const launcherPath = getLauncherPath();
  const flagStr = config.flags.trim();
  const flags = flagStr === "" ? [] : flagStr.split(/\s+/).filter(Boolean);
  const esc = (v: string) => '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/%/g, "%%") + '"';
  let execCmd = esc(launcherPath) + " --backend " + esc(config.backend || "auto") + " " + esc(config.url);
  for (const flag of flags) {
    execCmd += " " + esc(flag);
  }
  const nameField = config.name.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const execField = execCmd.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const iconField = (config.icon || config.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "")).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const newContent = `[Desktop Entry]
Version=1.0
Name=${nameField}
Comment=${nameField}
Exec=${execField}
Terminal=false
Type=Application
Icon=${iconField}
StartupNotify=true
`;
  const targetFile = config.name === sourceName ? sourceFile : join(appsDir, config.name + ".desktop");
  await writeFile(targetFile, newContent);
  if (config.name !== sourceName) {
    try {
      await unlink(sourceFile);
    } catch {}
  }
  try {
    spawn("update-desktop-database", [appsDir], { stdio: "ignore" });
  } catch {}
  return { ok: true, message: "Web app updated" };
}
