import fs from "node:fs";
import path from "node:path";
import slugify from "slugify";
import { parseMarkdownNote, serializeNoteToMarkdown } from "../utils/frontmatter";
import type { Note } from "./atoms";

/** `~/notes` and `~` are the only shortcuts a directory preference can carry. */
export const expandHome = (value: string, home: string): string => {
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  return value;
};

/** The title is the filename, so a note is the same file in the folder and the launcher. */
export const noteFileName = (title: string): string => {
  const slug = slugify(title);
  return `${/[a-z0-9]/i.test(slug) ? slug : "note"}.md`;
};

const birthtime = (stats: fs.Stats): Date => {
  const created = stats.birthtime;
  return created.getTime() > 0 ? created : stats.mtime;
};

export const noteFromFile = (file: string, contents: string, stats: fs.Stats): Note => {
  const parsed = parseMarkdownNote(contents);
  return {
    title: parsed.title ?? path.basename(file, ".md"),
    icon: parsed.icon,
    body: parsed.body,
    tags: parsed.tags ?? [],
    is_draft: false,
    createdAt: parsed.createdAt ?? birthtime(stats),
    updatedAt: parsed.updatedAt ?? stats.mtime,
    file,
  };
};

export const readNotes = (dir: string): Note[] => {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const notes: Note[] = [];
  for (const file of entries.filter((entry) => entry.toLowerCase().endsWith(".md"))) {
    const target = path.join(dir, file);
    try {
      notes.push(noteFromFile(file, fs.readFileSync(target, "utf8"), fs.statSync(target)));
    } catch {
      // An unreadable file is not a reason to hide the rest of the folder.
    }
  }
  return notes;
};

export const writeNoteFile = (dir: string, note: Note): string => {
  fs.mkdirSync(dir, { recursive: true });
  const file = noteFileName(note.title);
  fs.writeFileSync(path.join(dir, file), serializeNoteToMarkdown(note));
  return file;
};

export interface PersistedNotes {
  notes: Note[];
  /** Files replaced by a rename or a deletion, for the caller to trash with `gio`. */
  trash: string[];
}

/**
 * Writes the notes that differ from what the folder holds and reports the files
 * a rename or a deletion left behind. Notes without a file are drafts and are
 * kept out of the folder.
 */
export const persistNotes = (dir: string, previous: Note[], next: Note[]): PersistedNotes => {
  fs.mkdirSync(dir, { recursive: true });
  const notes: Note[] = [];
  const trash: string[] = [];

  for (const note of next) {
    if (note.is_draft) {
      notes.push({ ...note, file: undefined });
      continue;
    }
    const previousFile =
      note.file ?? previous.find((candidate) => !candidate.is_draft && candidate.createdAt === note.createdAt)?.file;
    const contents = serializeNoteToMarkdown(note);
    const file = noteFileName(note.title);
    const target = path.join(dir, file);

    if (previousFile && previousFile !== file) {
      trash.push(path.join(dir, previousFile));
    }

    let current: string | undefined;
    try {
      current = fs.readFileSync(target, "utf8");
    } catch {
      current = undefined;
    }
    if (current !== contents) {
      fs.writeFileSync(target, contents);
    }
    notes.push({ ...note, file });
  }

  const kept = new Set(notes.map((note) => note.file));
  for (const note of previous) {
    if (note.file && !kept.has(note.file)) {
      trash.push(path.join(dir, note.file));
    }
  }

  // A rename can point the old and the new name at the same path.
  return { notes, trash: [...new Set(trash)].filter((file) => !kept.has(path.basename(file))) };
};

export const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};
