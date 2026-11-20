import { getPreferenceValues, showToast, LocalStorage, Toast } from "@vicinae/api";

import { homedir } from "os";
import path from "path";
import fs from "fs";
import parseGitConfig from "parse-git-config";
import parseGitUrl from "git-url-parse";

export enum GitRepoType {
  All = "All",
  Repo = "Repo",
  Submodule = "Submodule",
  Worktree = "Worktree",
}

/** The five Open With slots of the manifest: a picked application and its override. */
export type OpenWithPreferences = {
  openWith1?: string;
  openWith1Custom?: string;
  openWith2?: string;
  openWith2Custom?: string;
  openWith3?: string;
  openWith3Custom?: string;
  openWith4?: string;
  openWith4Custom?: string;
  openWith5?: string;
  openWith5Custom?: string;
};

/**
 * The configured application ids, in slot order, empty slots dropped. A custom
 * id wins over the picker: the picker lists what Vicinae knows, and the field is
 * there for a desktop entry it does not.
 */
export function appIdsFrom(preferences: OpenWithPreferences): string[] {
  const slots: [string | undefined, string | undefined][] = [
    [preferences.openWith1, preferences.openWith1Custom],
    [preferences.openWith2, preferences.openWith2Custom],
    [preferences.openWith3, preferences.openWith3Custom],
    [preferences.openWith4, preferences.openWith4Custom],
    [preferences.openWith5, preferences.openWith5Custom],
  ];

  return slots
    .map(([picked, custom]) => custom?.trim() || picked?.trim() || "")
    .filter((id) => id.length > 0);
}

export interface GitRepo {
  name: string;
  fullPath: string;
  icon: string;
  repoType: GitRepoType;
  remotes: RemoteRepo[];
}

export interface RemoteRepo {
  name: string;
  host: string;
  url: string;
}

interface GitRemote {
  url: string;
}

export class GitRepoService {
  private static favoritesStorageKey = "git-repos-favorites";

  static async gitRepos(): Promise<GitRepo[]> {
    const preferences = getPreferenceValues<Preferences>();
    if (preferences.repoScanPath.length == 0) {
      showToast(Toast.Style.Failure, "", "Directories to scan has not been defined in settings");
      return [];
    }
    const [repoPaths, unresolvedPaths] = parsePath(preferences.repoScanPath);
    if (unresolvedPaths.length > 0) {
      showToast(
        Toast.Style.Failure,
        "",
        `Director${unresolvedPaths.length === 1 ? "y" : "ies"} not found: ${unresolvedPaths}`,
      );
    }
    const repos = await findRepos(
      repoPaths,
      parseInt(preferences.repoScanDepth, 10) || 3,
      preferences.includeSubmodules ?? false,
    );

    return repos;
  }

  static async favorites(): Promise<string[]> {
    const favoritesItem: string | undefined = await LocalStorage.getItem(GitRepoService.favoritesStorageKey);
    if (favoritesItem) {
      return JSON.parse(favoritesItem) as string[];
    } else {
      return [];
    }
  }

  static async addToFavorites(repo: GitRepo) {
    const favorites = await GitRepoService.favorites();
    favorites.push(repo.fullPath);
    await GitRepoService.saveFavorites(favorites);
  }

  static async removeFromFavorites(repo: GitRepo) {
    let favorites = await GitRepoService.favorites();
    favorites = favorites.filter((favorite) => favorite !== repo.fullPath);
    await GitRepoService.saveFavorites(favorites);
  }

  private static async saveFavorites(favorites: string[]) {
    await LocalStorage.setItem(GitRepoService.favoritesStorageKey, JSON.stringify(favorites));
  }
}

function resolveGitPath(repoPath: string): string {
  const gitPath = path.join(repoPath, ".git");

  try {
    const stats = fs.statSync(gitPath);

    if (stats.isFile()) {
      const content = fs.readFileSync(gitPath, "utf8").trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      const gitDirPath = match?.[1];

      if (gitDirPath !== undefined) {
        const basePath = path.dirname(gitPath);
        return path.resolve(basePath, gitDirPath);
      }
    }

    return gitPath;
  } catch {
    return gitPath;
  }
}

function resolveGitConfig(repoPath: string): string {
  return path.join(resolveGitPath(repoPath), "config");
}

function gitRemotes(path: string): RemoteRepo[] {
  let repos = [] as RemoteRepo[];
  const gitConfig = parseGitConfig.sync({ cwd: path, path: resolveGitConfig(path), expandKeys: true });
  if (gitConfig.remote != null) {
    for (const remoteName in gitConfig.remote) {
      const config = gitConfig.remote[remoteName] as GitRemote;
      try {
        const parsed = parseGitUrl(config.url);
        if (parsed.resource && parsed.full_name && !parsed.protocols.includes("file")) {
          const port = parsed.port ? `:${parsed.port}` : "";
          const host = parsed.resource.toLowerCase();
          repos = repos.concat({
            name: remoteName,
            host,
            url: `https://${host}${port}/${parsed.full_name}`,
          });
        }
      } catch {
        continue;
      }
    }
  }
  return repos;
}

export function resolvePath(filepath: string): string {
  if (filepath.length > 0 && filepath[0] === "~") {
    return path.join(homedir(), filepath.slice(1));
  }
  return filepath;
}

export function tildifyPath(p: string): string {
  const normalizedPath = path.normalize(p) + path.sep;

  return (
    normalizedPath.indexOf(homedir()) === 0
      ? normalizedPath.replace(homedir() + path.sep, `~${path.sep}`)
      : normalizedPath
  ).slice(0, -1);
}

/** `:`-separated (whatever `path.delimiter` is), `~` expanded, missing paths returned apart. */
export function parsePath(raw: string): [string[], string[]] {
  const resolvedPaths: string[] = [];
  const unresolvedPaths: string[] = [];
  for (const entry of raw.split(path.delimiter)) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const pathToVerify = resolvePath(trimmed);
    try {
      fs.accessSync(pathToVerify, fs.constants.R_OK);
      resolvedPaths.push(pathToVerify);
    } catch {
      unresolvedPaths.push(trimmed);
    }
  }
  return [resolvedPaths, unresolvedPaths];
}

function parseRepoPaths(mainPath: string, repoPaths: string[], submodules = false): GitRepo[] {
  if (submodules) {
    return repoPaths
      .filter((submodulePath) => fs.existsSync(submodulePath))
      .map((submodulePath) => {
        const fullPath = submodulePath;
        const name = path.basename(fullPath) || "unknown";
        const remotes = gitRemotes(fullPath);
        return {
          name: name,
          icon: "git-submodule-icon.png",
          fullPath: fullPath,
          repoType: GitRepoType.Submodule,
          remotes: remotes,
        };
      });
  } else {
    return repoPaths.map((repoPath) => {
      const fullPath = path.dirname(repoPath);
      const name = path.basename(fullPath) || "unknown";
      const remotes = gitRemotes(fullPath);
      return {
        name: name,
        icon: "git-icon.png",
        fullPath: fullPath,
        repoType: GitRepoType.Repo,
        remotes: remotes,
      };
    });
  }
}

function findSubmodules(repoPath: string): string[] {
  const gitmodulesPath = path.join(repoPath, ".gitmodules");
  try {
    const content = fs.readFileSync(gitmodulesPath, "utf8");
    const submodulePaths: string[] = [];
    for (const line of content.split("\n")) {
      const match = line.match(/^\s+path\s*=\s*(.+)$/);
      const submodulePath = match?.[1]?.trim();
      if (submodulePath !== undefined) {
        submodulePaths.push(path.join(repoPath, submodulePath));
      }
    }
    return submodulePaths;
  } catch {
    return [];
  }
}

async function statLink(fullPath: string, entry: fs.Dirent): Promise<fs.Stats | null> {
  if (!entry.isSymbolicLink()) {
    return null;
  }

  try {
    return await fs.promises.stat(fullPath);
  } catch {
    return null;
  }
}

async function findGitEntries(
  dir: string,
  maxDepth: number,
  currentDepth = 0,
): Promise<{ gitDirs: string[]; gitFiles: string[] }> {
  const gitDirs: string[] = [];
  const gitFiles: string[] = [];
  const dirsToScan = [{ dir, depth: currentDepth }];

  while (dirsToScan.length > 0) {
    const nextDir = dirsToScan.pop();
    if (!nextDir) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(nextDir.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(nextDir.dir, entry.name);
      if (entry.name === ".git") {
        const stat = await statLink(fullPath, entry);
        if (entry.isDirectory() || stat?.isDirectory()) {
          gitDirs.push(fullPath);
        } else if (entry.isFile() || stat?.isFile()) {
          gitFiles.push(fullPath);
        }
        continue;
      }

      if (nextDir.depth >= maxDepth) {
        continue;
      }

      if (entry.isDirectory()) {
        dirsToScan.push({ dir: fullPath, depth: nextDir.depth + 1 });
        continue;
      }

      const stat = await statLink(fullPath, entry);
      if (stat?.isDirectory()) {
        dirsToScan.push({ dir: fullPath, depth: nextDir.depth + 1 });
      }
    }
  }

  return { gitDirs, gitFiles };
}

export async function findRepos(paths: string[], maxDepth: number, includeSubmodules: boolean): Promise<GitRepo[]> {
  let foundRepos: GitRepo[] = [];
  for (const scanPath of paths) {
    try {
      const { gitDirs, gitFiles } = await findGitEntries(scanPath, maxDepth);

      const repos = parseRepoPaths(scanPath, gitDirs, false);
      const worktrees = parseRepoPaths(scanPath, gitFiles, false).map((repo) => ({
        ...repo,
        icon: "git-worktree-icon.png",
        repoType: GitRepoType.Worktree,
      }));
      if (includeSubmodules) {
        let subRepoPaths: string[] = [];
        repos.forEach((repo) => {
          const subP = findSubmodules(repo.fullPath);
          if (subP.length > 0) {
            subRepoPaths = subRepoPaths.concat(subP);
          }
        });
        const subRepos = parseRepoPaths(scanPath, subRepoPaths, true);
        foundRepos = foundRepos.concat(repos.concat(subRepos));
      } else {
        foundRepos = foundRepos.concat(repos);
      }
      worktrees.forEach((worktree) => {
        foundRepos.push(worktree);
      });
    } catch {
      continue;
    }
  }
  // A symlinked worktree reaches the same checkout under a second name: identify
  // repos by their real path, not by the path the walk happened to find.
  const seen = new Set<string>();
  foundRepos = foundRepos.filter((repo) => {
    let key = repo.fullPath;
    try {
      key = fs.realpathSync(key);
    } catch {
      // a path that vanished between the walk and here: keep it, realpath failed
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  foundRepos.sort((a, b) => {
    const fa = a.name.toLowerCase(),
      fb = b.name.toLowerCase();
    if (fa < fb) {
      return -1;
    }
    if (fa > fb) {
      return 1;
    }
    return 0;
  });
  return foundRepos;
}
