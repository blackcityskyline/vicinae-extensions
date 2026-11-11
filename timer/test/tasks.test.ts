import assert from "node:assert/strict";

import {
  appendLogEntry,
  expandHome,
  formatEntry,
  notePathFor,
  parseTimetable,
  stripMarkdownLinks,
  timetableLines,
} from "../src/utils/tasks.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

// The heading format, the break names and the log layout are the pomodoro's
// own: a note written for it must read the same here.
const note = [
  "# Timetable",
  "",
  "## Morning (09:00~12:00) 6p",
  "- 2p #482 : Ship the redesign",
  "\t- Review feedback",
  "\t- [done] Write migration",
  "- 1p [done] Old task",
  "",
  "## Breakfast (08:00~09:00)",
  "- 1p Eat",
  "",
  "## Lunch (12:00~13:00)",
  "- 1p Lunch",
  "",
  "## Deep Work (13:00~17:00) 3p",
  "- 3p [Mandarin camp](https://example.com/camp) report",
  "  - Collect notes",
  "",
  "# Notes",
  "",
  "## Later (18:00~19:00)",
  "- 1p Not part of the timetable",
].join("\n");

check("the timetable section ends at the next heading of its own level or higher", () => {
  const lines = note.split("\n");
  assert.deepEqual(timetableLines(lines, "# Timetable")?.slice(0, 2), ["", "## Morning (09:00~12:00) 6p"]);
  assert.equal(timetableLines(lines, "# Timetable")?.includes("## Later (18:00~19:00)"), false);
  assert.equal(timetableLines(lines, "# Missing"), null);
});

check("blocks carry their time range, their target and their tasks", () => {
  const blocks = parseTimetable(note, "# Timetable");
  assert.deepEqual(
    blocks.map((block) => [block.name, block.timeRange, block.targetPomodoros, block.isBreak]),
    [
      ["Morning", "09:00~12:00", 6, false],
      ["Breakfast", "08:00~09:00", 0, true],
      ["Lunch", "12:00~13:00", 0, true],
      ["Deep Work", "13:00~17:00", 3, false],
    ],
  );
});

check("tasks keep their pomodoro count, their done flag and their subtasks", () => {
  const [morning, , , deepWork] = parseTimetable(note, "# Timetable");
  assert.equal(morning?.tasks.length, 2);
  assert.deepEqual(morning?.tasks[0], {
    pomodoros: 2,
    title: "#482 : Ship the redesign",
    subtasks: [
      { title: "Review feedback", done: false },
      { title: "Write migration", done: true },
    ],
    done: false,
  });
  assert.equal(morning?.tasks[1]?.done, true);

  // A block with no tasks keeps an empty list; a markdown link in a title is
  // read as its text so it matches the log bullet.
  assert.deepEqual(deepWork?.tasks[0], {
    pomodoros: 3,
    title: "Mandarin camp report",
    subtasks: [{ title: "Collect notes", done: false }],
    done: false,
  });
});

check("a break block never offers its tasks", () => {
  const blocks = parseTimetable(note, "# Timetable");
  const lunch = blocks.find((block) => block.name === "Lunch");
  assert.deepEqual(lunch?.tasks, []);
});

check("a heading that is not the configured one reads as an empty timetable", () => {
  assert.deepEqual(parseTimetable(note, "# Plan"), []);
  assert.deepEqual(parseTimetable("", "# Timetable"), []);
});

check("a markdown link is its text, and nothing else", () => {
  assert.equal(stripMarkdownLinks("[#482](https://example.com) fix"), "#482 fix");
  assert.equal(stripMarkdownLinks("plain title"), "plain title");
});

check("an entry is the pomodoro's line: tab, checkbox, times, subtask", () => {
  const start = new Date(2026, 10, 11, 9, 2).getTime();
  const end = new Date(2026, 10, 11, 9, 27).getTime();
  assert.equal(formatEntry({ startedAt: start, endedAt: end, completed: true, subtask: "Review" }), "\t- [x] 09:02-09:27 Review");
  assert.equal(formatEntry({ startedAt: start, endedAt: end, completed: false }), "\t- [ ] 09:02-09:27");
});

check("an entry lands under its task bullet, after the entries already there", () => {
  const content = [
    "# Timetable",
    "",
    "### Pomodoro Log",
    "",
    "- Ship the redesign",
    "\t- [x] 09:02-09:27 Review feedback",
    "",
    "## Work Log",
    "Written by hand.",
  ].join("\n");

  const updated = appendLogEntry(content, "Ship the redesign", "\t- [x] 09:27-09:52 Tests");
  assert.deepEqual(updated.split("\n").slice(4, 8), [
    "- Ship the redesign",
    "\t- [x] 09:02-09:27 Review feedback",
    "\t- [x] 09:27-09:52 Tests",
    "",
  ]);
  assert.ok(updated.endsWith("## Work Log\nWritten by hand."));

  // The same line again is a no-op, which is what keeps a replayed settle
  // from writing the same session twice.
  assert.equal(appendLogEntry(updated, "Ship the redesign", "\t- [x] 09:27-09:52 Tests"), updated);
});

check("a new task gets its own bullet before the section's trailing blanks", () => {
  const content = ["### Pomodoro Log", "", "- Ship the redesign", "\t- [x] 09:02-09:27 Review", "", "## Work Log"].join("\n");
  const updated = appendLogEntry(content, "Write report", "\t- [ ] 13:00-13:10");
  assert.ok(
    updated.includes(
      "- Ship the redesign\n\t- [x] 09:02-09:27 Review\n- Write report\n\t- [ ] 13:00-13:10\n\n## Work Log",
    ),
    updated,
  );
});

check("a link in the task line still finds its log bullet", () => {
  const content = ["### Pomodoro Log", "", "- Mandarin camp report", "", "## Work Log"].join("\n");
  const updated = appendLogEntry(content, "Mandarin camp report", "\t- [x] 13:00-13:25");
  assert.ok(updated.includes("- Mandarin camp report\n\t- [x] 13:00-13:25"));
});

check("a missing log section is created inside the work log, after its callout", () => {
  const content = ["# Timetable", "", "## Work Log", "> plan the day", "", "Existing text."].join("\n");
  const entry = "\t- [x] 10:00-10:25";
  assert.deepEqual(appendLogEntry(content, "Task", entry).split("\n"), [
    "# Timetable",
    "",
    "## Work Log",
    "> plan the day",
    "",
    "### Pomodoro Log",
    "",
    "- Task",
    entry,
    "",
    "Existing text.",
  ]);
});

check("with neither section the log is appended to the end of the note", () => {
  const entry = "\t- [x] 10:00-10:25";
  assert.equal(appendLogEntry("Just a note", "Task", entry), `Just a note\n\n### Pomodoro Log\n\n- Task\n${entry}\n`);
  assert.equal(appendLogEntry("Ends with a newline\n", "Task", entry), `Ends with a newline\n\n### Pomodoro Log\n\n- Task\n${entry}\n`);
});

check("a directory means the daily note, a .md path means itself", () => {
  const now = new Date(2026, 10, 11, 23, 0);
  const home = "/home/u";
  assert.equal(notePathFor("~/notes", true, now, home), "/home/u/notes/2026-11-11.md");
  assert.equal(notePathFor("~/notes/", true, now, home), "/home/u/notes/2026-11-11.md");
  assert.equal(notePathFor("~/notes/daily.md", false, now, home), "/home/u/notes/daily.md");
  // A path that does not exist yet and is not a file, is a directory.
  assert.equal(notePathFor("/tmp/notes", false, now, home), "/tmp/notes/2026-11-11.md");
  assert.equal(notePathFor("   ", true, now, home), null);
  assert.equal(expandHome("~", home), home);
  assert.equal(expandHome("~/x", home), "/home/u/x");
  assert.equal(expandHome("~other/x", home), "~other/x");
});

console.log(`\n${checks} check(s) passed`);
