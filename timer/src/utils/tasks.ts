export interface Subtask {
  title: string;
  done: boolean;
}

export interface Task {
  pomodoros: number;
  title: string;
  subtasks: Subtask[];
  done: boolean;
}

export interface TimeBlock {
  name: string;
  timeRange: string;
  targetPomodoros: number;
  tasks: Task[];
  isBreak: boolean;
}

/** Blocks that hold rest, not work: their tasks are never offered. */
const BREAK_KEYWORDS = ["break", "lunch", "dinner", "breakfast", "supper"];

export const LOG_HEADER = "### Pomodoro Log";
export const LOG_SECTION_HEADER = "## Work Log";

const TASK_LINE_RE = /^- (\d+)p\s+(?:\[done\]\s+)?(.+)$/;
const SUBTASK_LINE_RE = /^(?:\t| {2,})- (?:\[done\]\s+)?(.+)$/;
const HEADING_RE = /^#{1,6} /;
const INDENTED_RE = /^(?:\t| {2,})\S/;

/** `[#482](https://…)` reads as `#482`, which is how the log finds the bullet again. */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function headingLevel(header: string): number {
  return header.match(/^#+/)?.[0].length ?? 1;
}

/** The whole block name must match a keyword, so "Breakfast" is not caught by "break". */
function isBreakBlock(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  return BREAK_KEYWORDS.includes(normalized);
}

/** The body of the timetable section: a heading of the same or a higher level ends it. */
export function timetableLines(lines: string[], header: string): string[] | null {
  const level = headingLevel(header);
  const start = lines.findIndex((line) => line.trim() === header.trim());
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length) {
    const heading = lines[end]?.match(/^(#{1,6}) /);
    if (heading && heading[1] !== undefined && heading[1].length <= level) break;
    end++;
  }
  return lines.slice(start + 1, end);
}

/**
 * Tasks from the timetable section of a note. Anything outside the section, and
 * anything in a break block, is ignored, so the note can hold more than a plan.
 *
 * ```markdown
 * # Timetable
 *
 * ## Morning (09:00~12:00) 6p
 * - 2p #482 : Ship the redesign
 * 	- Review feedback
 * ```
 */
export function parseTimetable(content: string, header: string): TimeBlock[] {
  const lines = content.split("\n");
  const body = timetableLines(lines, header);
  if (body === null) return [];

  const blockLevel = headingLevel(header) + 1;
  const blockRe = new RegExp(`^#{${blockLevel}} (.+?)(?:\\s+\\((.+?)\\))?\\s*(?:(\\d+)p)?$`);
  const blocks: TimeBlock[] = [];
  let block: TimeBlock | null = null;
  let task: Task | null = null;

  const closeTask = (): void => {
    if (block && task) block.tasks.push(task);
    task = null;
  };
  const closeBlock = (): void => {
    closeTask();
    if (block) blocks.push(block);
    block = null;
  };

  for (const line of body) {
    const blockMatch = line.match(blockRe);
    if (blockMatch) {
      closeBlock();
      const name = (blockMatch[1] ?? "").trim();
      block = {
        name,
        timeRange: blockMatch[2] ?? "",
        targetPomodoros: blockMatch[3] ? Number.parseInt(blockMatch[3], 10) : 0,
        tasks: [],
        isBreak: isBreakBlock(name),
      };
      continue;
    }
    if (!block || block.isBreak) continue;

    const taskMatch = line.match(TASK_LINE_RE);
    if (taskMatch) {
      closeTask();
      task = {
        pomodoros: Number.parseInt(taskMatch[1] ?? "0", 10),
        title: stripMarkdownLinks((taskMatch[2] ?? "").trim()),
        subtasks: [],
        done: /^- \d+p\s+\[done\]/.test(line),
      };
      continue;
    }

    const subtaskMatch = line.match(SUBTASK_LINE_RE);
    if (subtaskMatch && task) {
      task.subtasks.push({
        title: stripMarkdownLinks((subtaskMatch[1] ?? "").trim()),
        done: /^(?:\t| {2,})- \[done\]/.test(line),
      });
    }
  }
  closeBlock();
  return blocks;
}

const clock = (epoch: number): string => {
  const date = new Date(epoch);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/** One line of the log: what ran, when, and whether it reached its deadline. */
export interface Entry {
  startedAt: number;
  endedAt: number;
  completed: boolean;
  subtask?: string;
}

/** `\t- [x] 09:02-09:27 Subtask` — `[ ]` when it was stopped before the deadline. */
export function formatEntry(entry: Entry): string {
  const mark = entry.completed ? "x" : " ";
  const subtask = entry.subtask ? ` ${entry.subtask}` : "";
  return `\t- [${mark}] ${clock(entry.startedAt)}-${clock(entry.endedAt)}${subtask}`;
}

/**
 * Adds one entry under the task's bullet in the pomodoro log, creating the
 * section only when it is missing. The section is never regenerated, so
 * anything written by hand stays where it is.
 */
export function appendLogEntry(content: string, taskTitle: string, entryLine: string): string {
  const lines = content.split("\n");
  const headerIdx = lines.findIndex((line) => line.trim() === LOG_HEADER);

  if (headerIdx === -1) return insertNewSection(lines, taskTitle, entryLine);

  const start = headerIdx + 1;
  let end = start;
  while (end < lines.length && !HEADING_RE.test(lines[end] ?? "")) end++;

  for (let i = start; i < end; i++) {
    const match = (lines[i] ?? "").match(/^- (.+)$/);
    if (!match || stripMarkdownLinks((match[1] ?? "").trim()) !== taskTitle) continue;
    let insertAt = i + 1;
    while (insertAt < end && INDENTED_RE.test(lines[insertAt] ?? "")) {
      if (lines[insertAt] === entryLine) return content;
      insertAt++;
    }
    lines.splice(insertAt, 0, entryLine);
    return lines.join("\n");
  }

  let insertAt = end;
  while (insertAt > start && (lines[insertAt - 1] ?? "").trim() === "") insertAt--;
  lines.splice(insertAt, 0, ...(insertAt === start ? [""] : []), `- ${taskTitle}`, entryLine);
  return lines.join("\n");
}

function insertNewSection(lines: string[], taskTitle: string, entryLine: string): string {
  const section = [LOG_HEADER, "", `- ${taskTitle}`, entryLine];

  const sectionIdx = lines.findIndex((line) => line.trim() === LOG_SECTION_HEADER);
  if (sectionIdx !== -1) {
    let insertAt = sectionIdx + 1;
    while (
      insertAt < lines.length &&
      ((lines[insertAt] ?? "").startsWith(">") || (lines[insertAt] ?? "").trim() === "")
    ) {
      insertAt++;
    }
    lines.splice(insertAt, 0, ...section, "");
    return lines.join("\n");
  }

  const content = lines.join("\n");
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${section.join("\n")}\n`;
}

export function expandHome(setting: string, home: string): string {
  return setting.trim().replace(/^~(?=\/|$)/, home);
}

/**
 * The note to read and write. A directory means a daily note named by date, a
 * file means that file; a path that does not exist yet is treated as a file
 * when it ends in `.md` and as a directory otherwise.
 */
export function notePathFor(setting: string, isDirectory: boolean, now: Date, home: string): string | null {
  const path = expandHome(setting, home);
  if (!path) return null;
  if (!isDirectory && path.endsWith(".md")) return path;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${path.replace(/\/+$/, "")}/${day}.md`;
}
