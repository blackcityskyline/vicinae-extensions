/**
 * README image extraction.
 *
 * `Detail`'s Markdown renderer is documented as very bare bones, so images in a
 * README are not reliably drawn inline. This pulls them out instead, and
 * `ReadmeImages` shows them in a `Grid`, which does render remote images.
 *
 * HTML `<img>` is not an edge case. `vicinaehq/vicinae`'s README has seven
 * images and every one is an HTML tag, with none in Markdown syntax.
 *
 * Pure, so `test/readme-images.test.ts` can check it headlessly.
 */

export type ReadmeImage = {
  src: string;
  alt: string;
  /** Which syntax it came from, useful when a duplicate needs explaining. */
  syntax: "markdown" | "html" | "reference";
};

export type ImageRepo = { owner: string; repo: string; defaultBranch: string };

/**
 * Hosts that serve nothing but status badges.
 *
 * Without this a Grid is a wall of shields: 3 of the 4 images in
 * `BurntSushi/ripgrep`'s README are badges.
 */
const BADGE_HOSTS = [
  "img.shields.io",
  "badge.fury.io",
  "badgen.net",
  "flat.badgen.dev",
  "codecov.io",
  "circleci.com",
  "coveralls.io",
  "appveyor.com",
  "travis-ci.com",
  "travis-ci.org",
  "herokucdn.com",
  "repology.org",
];

export function isBadgeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (BADGE_HOSTS.some((host) => lower.includes(host))) return true;
  // Catches badges served from a project's own domain, e.g.
  // github.com/acme/widget/actions/workflows/ci/badge.svg
  return /(^|\/)(badge|badges)[/.]/.test(lower) || lower.includes("/badge.");
}

/** Collapse `.` and `..` without touching the leading `https://`. */
function normalisePath(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/**
 * Turn a README-relative path into a fetchable absolute URL.
 *
 * Relative paths are resolved against the repository's default branch rather
 * than `HEAD`, so the URL keeps pointing at the branch the README was read from.
 */
export function resolveReadmeUrl(url: string, repo: ImageRepo): string | null {
  const trimmed = url.trim();
  if (trimmed === "") return null;
  // Inline data URIs are not fetchable and are always decorative.
  if (/^data:/i.test(trimmed)) return null;

  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const path = normalisePath(trimmed.replace(/^\.\//, ""));
  if (path === "") return null;

  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.defaultBranch}/${path}`;
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/g;
const MARKDOWN_REFERENCE = /!\[[^\]]*\]\[([^\]]+)\]/g;
const REFERENCE_DEFINITION = /^\[([^\]]+)\]:\s*(\S+)/gm;
const HTML_IMAGE = /<img\b[^>]*>/gi;
const HTML_SRC = /\bsrc\s*=\s*["']([^"']+)["']/i;
const HTML_ALT = /\balt\s*=\s*["']([^"']*)["']/i;

function altOf(markdown: string, marker: string): string {
  const start = markdown.indexOf(marker);
  if (start < 0) return "";
  const open = markdown.indexOf("[", start);
  const close = markdown.indexOf("]", open + 1);
  return open < 0 || close < 0 ? "" : markdown.slice(open + 1, close).trim();
}

export function extractReadmeImages(
  markdown: string,
  repo: ImageRepo,
  options: { includeBadges?: boolean } = {},
): ReadmeImage[] {
  const found: ReadmeImage[] = [];
  const seen = new Set<string>();

  const add = (raw: string, alt: string, syntax: ReadmeImage["syntax"]) => {
    const src = resolveReadmeUrl(raw, repo);
    if (src === null) return;
    if (!options.includeBadges && isBadgeUrl(src)) return;
    if (seen.has(src)) return;
    seen.add(src);
    found.push({ src, alt, syntax });
  };

  // Reference definitions first, so `![x][ref]` can be resolved below.
  const definitions = new Map<string, string>();
  for (const match of markdown.matchAll(REFERENCE_DEFINITION)) {
    definitions.set((match[1] ?? "").toLowerCase(), match[2] ?? "");
  }

  for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
    add(match[1] ?? "", altOf(markdown, match[0]), "markdown");
  }

  for (const match of markdown.matchAll(MARKDOWN_REFERENCE)) {
    const key = (match[1] ?? "").toLowerCase();
    const target = definitions.get(key);
    if (target !== undefined) add(target, altOf(markdown, match[0]), "reference");
  }

  for (const match of markdown.matchAll(HTML_IMAGE)) {
    const tag = match[0];
    const src = HTML_SRC.exec(tag)?.[1];
    if (src === undefined) continue;
    add(src, HTML_ALT.exec(tag)?.[1]?.trim() ?? "", "html");
  }

  return found;
}
