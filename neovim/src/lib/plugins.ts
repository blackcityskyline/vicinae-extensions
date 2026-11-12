/**
 * The plugin list is two files: `lazy-lock.json` for the pinned commit, and each
 * plugin's `.git/config` for the real repository. The audit found 42/42 remotes
 * there, so nothing is guessed from a name.
 */

import fs from "node:fs";
import path from "node:path";

import { lazyLockPath, pluginRoot } from "~/lib/paths";

export type Plugin = {
  name: string;
  branch: string;
  commit: string;
  /** `null` when the plugin has no origin — the row then shows no link. */
  url: string | null;
};

type Locked = { branch?: string; commit?: string };

export function readLock(file: string = lazyLockPath()): Record<string, Locked> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, Locked>) : {};
  } catch {
    return {};
  }
}

/** `https://`, `git@host:owner/repo` and `ssh://git@host/owner/repo` all become a browser URL. */
export function browserUrl(remote: string): string | undefined {
  const value = remote.trim().replace(/\.git$/, "");
  if (/^https?:\/\//.test(value)) return value;

  // The scp form has to come second: `ssh://git@host/path` also looks like `host:path`.
  const ssh = /^ssh:\/\/(?:[\w.-]+@)?([\w.-]+)\/(.+)$/.exec(value);
  if (ssh !== null) return `https://${ssh[1]}/${ssh[2]}`;

  const scp = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/.exec(value);
  if (scp !== null) return `https://${scp[1]}/${scp[2]}`;

  return undefined;
}

/** The `url =` line inside `[remote "origin"]`, or `undefined` for a plugin that has no git dir. */
export function originOf(configText: string): string | undefined {
  const section = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(configText);
  if (section === null) return undefined;
  return /^\s*url\s*=\s*(.+)$/m.exec(section[1] ?? "")?.[1]?.trim();
}

export function pluginUrl(name: string, root: string = pluginRoot()): string | undefined {
  try {
    const remote = originOf(fs.readFileSync(path.join(root, name, ".git", "config"), "utf8"));
    return remote === undefined ? undefined : browserUrl(remote);
  } catch {
    return undefined;
  }
}

export function readPlugins(root: string = pluginRoot(), lock: string = lazyLockPath()): Plugin[] {
  return Object.entries(readLock(lock))
    .map(([name, info]) => ({
      name,
      branch: info.branch ?? "",
      commit: info.commit ?? "",
      url: pluginUrl(name, root) ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Seven characters is what `git log --oneline` shows, and what fits a subtitle. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}
