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

export interface DesktopEntryFields {
  name: string;
  exec: string;
  icon: string;
}

/** The desktop file for a web app. `exec` and `name` are escaped here, once. */
export function buildDesktopEntry({ name, exec, icon }: DesktopEntryFields): string {
  const escapedName = desktopStringEscape(name);
  return [
    "[Desktop Entry]",
    "Version=1.0",
    `Name=${escapedName}`,
    `Comment=${escapedName}`,
    `Exec=${desktopStringEscape(exec)}`,
    "Terminal=false",
    "Type=Application",
    `Icon=${desktopStringEscape(icon)}`,
    "StartupNotify=true",
    "",
  ].join("\n");
}

const unescapeDesktopString = (value: string): string =>
  value.replace(/\\([\\trns])/g, (_, c: string) => ({ t: "\t", r: "\r", n: "\n", s: " ", "\\": "\\" })[c]!);

/** One `key=value` line of the entry's main group, unescaped; null when absent. */
export function readEntryField(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1] === undefined ? null : unescapeDesktopString(match[1]);
}

export interface WebappLaunch {
  backend: string;
  url: string;
  flags: string[];
}

/**
 * Reads back what `buildDesktopExec` wrote: the launcher, an optional `--backend`,
 * the URL, then the flags. Entries made by the Noctalia plugin have no
 * `--backend` and parse as well. Null when the line is not a web app's.
 */
export function parseWebappExec(exec: string): WebappLaunch | null {
  const tokens = [...exec.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((m) =>
    m[2] ?? (m[1] ?? "").replace(/\\(.)/g, "$1").replace(/%%/g, "%"),
  );
  if (!tokens[0]?.endsWith("webapp-launch")) return null;
  let rest = tokens.slice(1);
  let backend = "auto";
  if (rest[0] === "--backend") {
    backend = rest[1] ?? "auto";
    rest = rest.slice(2);
  }
  const [url, ...flags] = rest;
  return url === undefined ? null : { backend, url, flags };
}

/** `KEY=VALUE` lines, optionally prefixed with `export`, quotes stripped; `#` lines ignored. */
export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*?)\s*$/);
    if (match?.[1] === undefined) continue;
    env[match[1]] = (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}
