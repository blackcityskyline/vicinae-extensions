import fs from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TodoItem, TodoSections } from "./types";

export class TodoRevisionConflictError extends Error {
  constructor(
    readonly sections: TodoSections,
    readonly revision: string | null,
  ) {
    super("The list changed in another command. Select the task in the refreshed list and try again.");
  }
}

const emptySections = (): TodoSections => ({ pinned: [], todo: [], completed: [] });

function parseItem(value: unknown): TodoItem {
  if (
    typeof value !== "object" ||
    value === null ||
    !("title" in value) ||
    typeof value.title !== "string" ||
    !("completed" in value) ||
    typeof value.completed !== "boolean" ||
    !("timeAdded" in value) ||
    typeof value.timeAdded !== "number" ||
    !Number.isFinite(value.timeAdded) ||
    ("tag" in value && value.tag !== undefined && typeof value.tag !== "string") ||
    ("dueDate" in value &&
      value.dueDate !== undefined &&
      (typeof value.dueDate !== "number" ||
        !Number.isFinite(value.dueDate) ||
        !Number.isFinite(new Date(value.dueDate).getTime()))) ||
    ("priority" in value &&
      value.priority !== undefined &&
      value.priority !== 1 &&
      value.priority !== 2 &&
      value.priority !== 3)
  ) {
    throw new Error("Invalid todo data. The original file has not been changed.");
  }
  return {
    title: value.title,
    completed: value.completed,
    timeAdded: value.timeAdded,
    tag: "tag" in value && typeof value.tag === "string" ? value.tag : undefined,
    dueDate: "dueDate" in value && typeof value.dueDate === "number" ? value.dueDate : undefined,
    priority:
      "priority" in value && (value.priority === 1 || value.priority === 2 || value.priority === 3)
        ? value.priority
        : undefined,
  };
}

function parseItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid todo section. Expected a list of tasks.");
  return value.map(parseItem);
}

/** Legacy JSON, kept for `todo.json` files and exported backups. */
export function parseTodos(contents: string): TodoSections {
  const value: unknown = JSON.parse(contents);
  if (Array.isArray(value) && value.length === 2) {
    const items = parseItems(value[1]);
    return {
      pinned: parseItems(value[0]),
      todo: items.filter((item) => !item.completed),
      completed: items.filter((item) => item.completed),
    };
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("pinned" in value) ||
    !("todo" in value) ||
    !("completed" in value)
  ) {
    throw new Error("Invalid todo file. Use a markdown todo file or a Todo List JSON backup.");
  }
  return { pinned: parseItems(value.pinned), todo: parseItems(value.todo), completed: parseItems(value.completed) };
}

const DUE = "📅";
const CREATED = "➕";
const PRIORITY_GLYPHS: Record<1 | 2 | 3, string> = { 1: "🔽", 2: "🔼", 3: "⏫" };
const GLYPH_PRIORITIES: Record<string, 1 | 2 | 3> = {
  "🔽": 1,
  "⏬": 1,
  "🔼": 2,
  "⏫": 3,
  "🔺": 3,
};
const HEADING_SECTIONS: Record<string, keyof TodoSections> = {
  pinned: "pinned",
  todo: "todo",
  completed: "completed",
};

/** `YYYY-MM-DD` in local time: Obsidian reads a date, not an instant. */
const localDay = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
};

const dayStart = (stamp: string): number | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date.getTime() : undefined;
};

function serializeItem(item: TodoItem): string {
  const parts = [`- [${item.completed ? "x" : " "}] ${item.title}`];
  if (item.tag) parts.push(item.tag.startsWith("#") ? item.tag : `#${item.tag}`);
  if (item.dueDate !== undefined) parts.push(`${DUE} ${localDay(item.dueDate)}`);
  if (item.priority) parts.push(PRIORITY_GLYPHS[item.priority]);
  if (item.timeAdded !== 0) parts.push(`${CREATED} ${localDay(item.timeAdded)}`);
  return parts.join(" ");
}

/** Obsidian Tasks emoji syntax, so the plugin and a plain editor read the same file. */
export function serializeMarkdownTodos(sections: TodoSections): string {
  const lines = ["# Todo", ""];
  for (const key of ["pinned", "todo", "completed"] as const) {
    lines.push(`## ${key[0]!.toUpperCase()}${key.slice(1)}`, "", ...sections[key].map(serializeItem), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]+)/u;
const DUE_DATE = new RegExp(`${DUE}\\s*(\\d{4}-\\d{2}-\\d{2})`, "u");
const CREATED_DATE = new RegExp(`${CREATED}\\s*(\\d{4}-\\d{2}-\\d{2})`, "u");
const PRIORITY = /(🔺|⏫|🔼|🔽|⏬)/u;

function parseItemLine(text: string, completed: boolean): TodoItem {
  const glyph = PRIORITY.exec(text)?.[1];
  const due = DUE_DATE.exec(text)?.[1];
  const created = CREATED_DATE.exec(text)?.[1];
  const tag = TAG.exec(text)?.[1];
  const title = text
    .replace(DUE_DATE, " ")
    .replace(CREATED_DATE, " ")
    .replace(PRIORITY, " ")
    .replace(TAG, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dueDate = due === undefined ? undefined : dayStart(due);
  const timeAdded = created === undefined ? 0 : (dayStart(created) ?? 0);
  const priority = glyph === undefined ? undefined : GLYPH_PRIORITIES[glyph];
  return {
    title,
    completed,
    timeAdded,
    ...(tag === undefined ? {} : { tag }),
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(priority === undefined ? {} : { priority }),
  };
}

/**
 * Returns `null` for a file that carries neither a task nor one of the three
 * headings, so a corrupt file is never shown as an empty list.
 */
export function parseMarkdownTodos(contents: string): TodoSections | null {
  const sections = emptySections();
  let section: keyof TodoSections | null = null;
  let marked = contents.trim() === "";
  let fenced = false;
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(trimmed);
    if (heading) {
      const key = HEADING_SECTIONS[heading[1]!.toLowerCase()];
      if (key) {
        section = key;
        marked = true;
      }
      continue;
    }
    const task = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
    if (!task) continue;
    marked = true;
    const completed = task[1] !== " ";
    const item = parseItemLine(task[2]!, completed);
    if (section === "pinned") sections.pinned.push(item);
    else if (completed) sections.completed.push(item);
    else sections.todo.push(item);
  }
  return marked ? sections : null;
}

/** A markdown file or a legacy/exported JSON file, whichever it is. */
export function parseTodoFile(contents: string): TodoSections {
  const markdown = parseMarkdownTodos(contents);
  if (markdown) return markdown;
  try {
    return parseTodos(contents);
  } catch {
    throw new Error("Invalid todo file. Use a markdown todo file or a Todo List JSON backup.");
  }
}

function validateSections(sections: TodoSections): TodoSections {
  return {
    pinned: sections.pinned.map(parseItem),
    todo: sections.todo.map(parseItem),
    completed: sections.completed.map(parseItem),
  };
}

function readFile(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export function readTodos(file: string): { sections: TodoSections; revision: string | null } {
  const revision = readFile(file);
  if (revision === null) {
    // A todo.json beside a missing todo.md is the previous storage; convert it in place.
    const legacyFile = join(dirname(file), "todo.json");
    const legacy = legacyFile === file ? null : readFile(legacyFile);
    if (legacy === null) return { sections: emptySections(), revision: null };
    let migrated: string;
    try {
      migrated = serializeMarkdownTodos(parseTodoFile(legacy));
    } catch (error) {
      throw new Error(`Could not read ${legacyFile}. Use Import Todo Backup to recover your list. ${String(error)}`);
    }
    atomicWrite(file, migrated);
    return { sections: parseMarkdownTodos(migrated)!, revision: migrated };
  }
  try {
    return { sections: parseTodoFile(revision), revision };
  } catch (error) {
    throw new Error(`Could not read ${file}. Use Import Todo Backup to recover your list. ${String(error)}`);
  }
}

const lockWait = new Int32Array(new SharedArrayBuffer(4));

function withFileLock<T>(file: string, action: () => T): T {
  fs.mkdirSync(dirname(file), { recursive: true });
  const lockFile = `${file}.lock`;
  const deadline = Date.now() + 2000;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockFile, "wx");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 10_000) fs.rmSync(lockFile, { force: true });
      } catch {
        // The lock was released between the failed create and this check.
      }
      if (Date.now() > deadline) throw new Error("The list is being saved by another command. Try again.");
      Atomics.wait(lockWait, 0, 0, 20);
    }
  }
  try {
    return action();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockFile, { force: true });
  }
}

function atomicWrite(file: string, contents: string) {
  fs.mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function writeTodos(file: string, sections: TodoSections, expectedRevision: string | null): string {
  const contents = serializeMarkdownTodos(validateSections(sections));
  return withFileLock(file, () => {
    const current = readFile(file);
    if (current !== expectedRevision) {
      throw new TodoRevisionConflictError(current === null ? emptySections() : parseTodoFile(current), current);
    }
    if (current !== null) {
      parseTodoFile(current);
      atomicWrite(`${file}.backup`, current);
    }
    atomicWrite(file, contents);
    return contents;
  });
}

/** Import is explicit recovery: preserve even an unreadable current file before replacing it. */
export function importTodos(file: string, contents: string): TodoSections {
  const markdown = serializeMarkdownTodos(parseTodoFile(contents));
  return withFileLock(file, () => {
    const current = readFile(file);
    if (current !== null) atomicWrite(`${file}.${Date.now()}.${randomUUID()}.backup`, current);
    atomicWrite(file, markdown);
    return parseMarkdownTodos(markdown)!;
  });
}

export function exportTodos(file: string, destination: string): void {
  const { sections } = readTodos(file);
  fs.writeFileSync(destination, JSON.stringify(sections, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
}
