import type { Category } from "./categories";

export interface DesktopApp {
  /** The desktop file's name, which is what `xdg-mime default` takes. */
  id: string;
  name: string;
  mimes: ReadonlySet<string>;
  categories: ReadonlySet<string>;
}

export interface Candidate {
  id: string;
  name: string;
}

const splitList = (value: string): string[] =>
  value.split(";").map((item) => item.trim()).filter(Boolean);

/**
 * Reads the `[Desktop Entry]` group of a desktop file. Null for an entry that
 * is deleted (`Hidden=true`) or has no plain `Name`. Localised names
 * (`Name[ru]=`) and the `[Desktop Action …]` groups are not the application's
 * own name and are skipped.
 */
export function parseDesktopEntry(id: string, text: string): DesktopApp | null {
  let name = "";
  let hidden = false;
  const mimes = new Set<string>();
  const categories = new Set<string>();
  let inMainGroup = false;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("[")) {
      inMainGroup = line.trim() === "[Desktop Entry]";
      continue;
    }
    if (!inMainGroup) continue;
    const match = line.match(/^\s*([A-Za-z0-9-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, value = ""] = match;
    if (key === "Name" && name === "") name = value;
    else if (key === "Hidden") hidden = value === "true";
    else if (key === "MimeType") splitList(value).forEach((mime) => mimes.add(mime));
    else if (key === "Categories") splitList(value).forEach((cat) => categories.add(cat));
  }

  return name === "" || hidden ? null : { id, name, mimes, categories };
}

/**
 * Applications offered for a category: one that declares at least one of its
 * types and, when the category names menu categories, one of those too. Browsers
 * are offered only as browsers, because they register for nearly every type.
 */
export function candidatesFor(apps: readonly DesktopApp[], category: Category): Candidate[] {
  return apps
    .filter((app) => category.mimes.some((mime) => app.mimes.has(mime)))
    .filter((app) => category.key === "browser" || !app.categories.has("WebBrowser"))
    .filter(
      (app) =>
        !category.desktopCategories || category.desktopCategories.some((cat) => app.categories.has(cat)),
    )
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * The directories desktop files live in, highest priority first. The XDG
 * variables come first so a system that keeps applications elsewhere (NixOS,
 * Guix) is scanned where it really is; Flatpak's exports are listed separately
 * because they are not always on `XDG_DATA_DIRS`.
 */
export function applicationDirs(env: Record<string, string | undefined>): string[] {
  const home = env.HOME ?? "";
  const dataDirs = env.XDG_DATA_DIRS || "/usr/local/share:/usr/share";
  const bases = [
    env.XDG_DATA_HOME || `${home}/.local/share`,
    ...dataDirs.split(":"),
    `${home}/.local/share/flatpak/exports/share`,
    "/var/lib/flatpak/exports/share",
    ...(env.GUIX_PROFILE ? [`${env.GUIX_PROFILE}/share`] : []),
    ...(env.GUIX_ENVIRONMENT ? [`${env.GUIX_ENVIRONMENT}/share`] : []),
  ];
  const dirs = bases
    .filter((base) => base.startsWith("/"))
    .map((base) => `${base.replace(/\/+$/, "")}/applications`);
  return [...new Set(dirs)];
}

/**
 * What the types of one category currently answer. `id` is the first type's
 * answer, which is the one shown; `mixed` says the others disagree, which
 * happens when a type was changed outside this extension.
 */
export function summarizeDefaults(answers: readonly (string | null)[]): { id: string | null; mixed: boolean } {
  const id = answers[0] ?? null;
  return { id, mixed: answers.some((answer) => answer !== id) };
}
