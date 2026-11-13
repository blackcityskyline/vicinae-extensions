export type SourceTag = "local" | "remote";

export type PackageEntry = {
  /** the manifest `name`, which becomes the directory under `extensions/` */
  id: string;
  title: string;
  description: string;
  author?: string;
  /** absolute path for a local bundle, absolute URL for a remote one */
  icon?: string;
  source: SourceTag;
  /** local bundle directory or remote archive URL */
  origin: string;
  installed: boolean;
};

export type Bundle = {
  dir: string;
  icon?: string;
};

const HTTP = /^https?:\/\//i;

export function isRemoteSource(source: string): boolean {
  return HTTP.test(source.trim());
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

/**
 * The remote repository format, measured against nothing upstream: it exists
 * only for this extension, so it carries exactly what a row shows.
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

    const icon = text(entry.icon);
    entries.push({
      id,
      title,
      description,
      author: text(entry.author),
      icon: icon ? new URL(icon, from).toString() : undefined,
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
    source: "local",
    origin: bundle.dir,
    installed,
  };
}

/** `~` in a preference is the user's home; the shell is not there to expand it. */
export function expandHome(source: string, home: string): string {
  const trimmed = source.trim();
  return trimmed === "~" || trimmed.startsWith("~/") ? home + trimmed.slice(1) : trimmed;
}
