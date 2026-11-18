export type SourceTag = "local" | "remote";

/** How a source is read: scanned as a directory, fetched as an index, or cloned. */
export type SourceKind = "local" | "index" | "git";

/** One source that could not be read; the others still load. */
export type SourceFailure = {
  source: string;
  message: string;
};

export type SourcesResult = {
  entries: PackageEntry[];
  failures: SourceFailure[];
};

export type CommandEntry = {
  title: string;
  description?: string;
};

export type PackageEntry = {
  /** the manifest `name`, which becomes the directory under `extensions/` */
  id: string;
  title: string;
  description: string;
  author?: string;
  /** absolute path for a local bundle, absolute URL for a remote one */
  icon?: string;
  categories: string[];
  platforms: string[];
  commands: CommandEntry[];
  /** only a remote index has a download count */
  downloads?: number;
  avatar?: string;
  readme?: string;
  sourceUrl?: string;
  source: SourceTag;
  /** local bundle directory or remote archive URL */
  origin: string;
  /** the source this row was read from, as the user wrote it */
  repository?: string;
  installed: boolean;
};

export type Bundle = {
  dir: string;
  icon?: string;
};

const HTTP = /^https?:\/\//i;
const GIT_URL = /^(?:git@|ssh:\/\/|file:\/\/)/i;
const GIT_HOST =
  /^https?:\/\/(?:[^/@\s]+@)?(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)(?::\d+)?\//i;

/**
 * A Git repository is cloned, everything else over http is an `index.json`.
 * Hosted repositories are named because `github.com/u/r` does not serve the
 * file itself, and `.git`/`git@` covers any other host without special cases.
 */
function isGitSource(source: string): boolean {
  const trimmed = source.trim();
  return (
    GIT_URL.test(trimmed) ||
    GIT_HOST.test(trimmed) ||
    /\.git$/.test(trimmed.replace(/\/+$/, ""))
  );
}

export function sourceKind(source: string): SourceKind {
  const trimmed = source.trim();
  if (!HTTP.test(trimmed) && !GIT_URL.test(trimmed)) return "local";
  return isGitSource(trimmed) ? "git" : "index";
}

const KIND_LABELS: Record<SourceKind, string> = {
  local: "Local folder",
  index: "Index URL",
  git: "Git repository",
};

export function sourceKindLabel(source: string): string {
  return KIND_LABELS[sourceKind(source)];
}

/**
 * The preference is always the first source; the ones added from the store
 * follow. A duplicate wins for the earlier source, and a blank entry is not a
 * source at all.
 */
export function allSources(preference: string, added: string[]): string[] {
  const seen = new Set<string>();
  const sources: string[] = [];
  for (const raw of [preference, ...added]) {
    const source = raw.trim();
    if (source.length === 0 || seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
  }
  return sources;
}

/**
 * Two repositories can list the same extension; there is one row per manifest
 * `name`, and the earlier source provides it, because that one is the
 * preference.
 */
export function mergeEntries(entries: PackageEntry[]): PackageEntry[] {
  const seen = new Set<string>();
  const merged: PackageEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Accepts the index itself or the directory serving it: `…/repo`,
 * `…/repo/` and `…/repo/index.json` all resolve to the same file.
 */
export function indexUrl(source: string): string {
  const url = new URL(source.trim());
  if (!url.pathname.endsWith(".json")) {
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    url.pathname += "index.json";
  }
  return url.toString();
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

/** The manifest and the index describe commands the same way: a title, maybe a description. */
function commands(value: unknown): CommandEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CommandEntry[] = [];
  for (const item of value) {
    const command = item as Record<string, unknown> | null;
    const title = text(command?.title);
    if (title) entries.push({ title, description: text(command?.description) });
  }
  return entries;
}

function url(value: unknown, from: string): string | undefined {
  const raw = text(value);
  return raw ? new URL(raw, from).toString() : undefined;
}

/**
 * The remote repository format, measured against nothing upstream: it exists
 * only for this extension, so it carries whatever the detail page displays.
 */
export function parseIndex(raw: string, from: string): PackageEntry[] {
  const data = JSON.parse(raw) as { extensions?: unknown };
  if (!Array.isArray(data.extensions)) {
    throw new Error("index.json has no extensions array");
  }

  const entries: PackageEntry[] = [];
  for (const item of data.extensions) {
    const entry = item as Record<string, unknown>;
    const id = text(entry.name);
    const title = text(entry.title);
    const description = text(entry.description);
    const archive = text(entry.archive);
    // A row without an archive cannot be installed; it is not shown at all.
    if (!id || !title || !description || !archive) continue;

    entries.push({
      id,
      title,
      description,
      author: text(entry.author),
      icon: url(entry.icon, from),
      categories: strings(entry.categories),
      platforms: strings(entry.platforms),
      commands: commands(entry.commands),
      downloads: typeof entry.downloads === "number" ? entry.downloads : undefined,
      avatar: url(entry.avatar, from),
      readme: url(entry.readme, from),
      sourceUrl: url(entry.source, from),
      source: "remote",
      origin: new URL(archive, from).toString(),
      installed: false,
    });
  }

  return entries;
}

/**
 * A local bundle is what `vici build` leaves in `extensions/`: `package.json`
 * plus compiled entrypoints. Nothing warns about a malformed one, so a package
 * that cannot be named and described is skipped by the caller.
 */
export function manifestEntry(
  manifest: unknown,
  bundle: Bundle,
  installed: boolean,
): PackageEntry | undefined {
  const data = manifest as Record<string, unknown> | null;
  const id = text(data?.name);
  const title = text(data?.title);
  const description = text(data?.description);

  if (!id || !title || !description) return undefined;

  return {
    id,
    title,
    description,
    author: text(data?.author),
    icon: bundle.icon,
    categories: strings(data?.categories),
    platforms: strings(data?.platforms),
    commands: commands(data?.commands),
    source: "local",
    origin: bundle.dir,
    installed,
  };
}

/**
 * The id becomes a directory name under `extensions/`, so an index that says
 * `../../.config` must not be able to write outside it. The manifest names are
 * slugs; anything else is refused before the filesystem sees it.
 */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

/** `~` in a preference is the user's home; the shell is not there to expand it. */
export function expandHome(source: string, home: string): string {
  const trimmed = source.trim();
  return trimmed === "~" || trimmed.startsWith("~/") ? home + trimmed.slice(1) : trimmed;
}
