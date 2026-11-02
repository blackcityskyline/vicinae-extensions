import { homedir } from "node:os";
import { join } from "node:path";

export function getApplicationsDir(): string {
  return join(homedir(), ".local", "share", "applications");
}

export function getIconsDir(): string {
  return join(homedir(), ".local", "share", "icons", "hicolor", "256x256", "apps");
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return "https://" + trimmed;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Name is required";
  if (trimmed.includes("/")) return "Name cannot contain \"/\"";
  return null;
}

export function validateUrl(url: string): string | null {
  const normalized = normalizeUrl(url);
  if (normalized.trim() === "") return "URL is required";
  if (/\s/.test(normalized)) return "URL must not contain whitespace";
  if (!/^https?:\/\//i.test(normalized)) return "URL must be http or https";
  return null;
}

export function desktopStringEscape(value: string): string {
  let out = value.replace(/\\/g, "\\\\");
  out = out.replace(/\t/g, "\\t");
  out = out.replace(/\r/g, "\\r");
  out = out.replace(/\n/g, "\\n");
  if (out.startsWith(" ")) {
    out = "\\s" + out.slice(1);
  }
  return out;
}

export function desktopExecArg(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/%/g, "%%");
  return '"' + escaped + '"';
}

export function buildDesktopExec(
  launcherPath: string,
  backend: string,
  url: string,
  flags: string[],
): string {
  let cmd = desktopExecArg(launcherPath) + " --backend " + desktopExecArg(backend) + " " + desktopExecArg(url);
  for (const flag of flags) {
    cmd += " " + desktopExecArg(flag);
  }
  return cmd;
}

export function isWebappDesktop(content: string): boolean {
  return /^Exec=.*webapp-launch/m.test(content);
}

export function extractWebappNameFromPath(path: string): string | null {
  const match = path.match(/([^/]+)\.desktop$/);
  return match && match[1] ? match[1] : null;
}

export function parseWebappList(stdout: string): string[] {
  const apps: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.match(/([^/]+)\.desktop\s*$/);
    if (name && name[1]) {
      apps.push(name[1]);
    }
  }
  apps.sort();
  return apps;
}