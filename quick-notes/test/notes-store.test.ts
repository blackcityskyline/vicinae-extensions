import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expandHome, noteFileName, persistNotes, readNotes } from "../src/services/notes-store.ts";
import type { Note } from "../src/services/atoms.ts";

let failures = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "quick-notes-test-"));
const dir = path.join(folder, "Notes");

const note = (overrides: Partial<Note> = {}): Note => ({
  title: "Hello Note",
  icon: "BlankDocument",
  body: "Some **markdown** body",
  tags: ["work"],
  is_draft: false,
  createdAt: new Date(2026, 10, 20, 16, 42, 12),
  updatedAt: new Date(2026, 10, 20, 17, 5, 30),
  ...overrides,
});

check("expandHome expands the home shortcut and nothing else", () => {
  assert.equal(expandHome("~/Documents/Notes", "/home/black"), "/home/black/Documents/Notes");
  assert.equal(expandHome("~", "/home/black"), "/home/black");
  assert.equal(expandHome("/srv/notes", "/home/black"), "/srv/notes");
  assert.equal(expandHome("relative/notes", "/home/black"), "relative/notes");
});

check("the title names the file", () => {
  assert.equal(noteFileName("Hello Note"), "Hello-Note.md");
  assert.equal(noteFileName("Что дальше?"), "Chto-dalshe.md");
  assert.equal(noteFileName("!!!"), "note.md");
});

check("a saved note comes back from the folder with the same fields", () => {
  const { notes, trash } = persistNotes(dir, [], [note()]);
  assert.deepEqual(trash, []);
  assert.equal(notes[0]?.file, "Hello-Note.md");

  const [read] = readNotes(dir);
  assert.equal(read?.title, "Hello Note");
  assert.equal(read?.icon, "BlankDocument");
  assert.deepEqual(read?.tags, ["work"]);
  assert.equal(read?.body, "Some **markdown** body");
  assert.equal(read?.createdAt.getTime(), new Date(2026, 10, 20, 16, 42, 12).getTime());
  assert.equal(read?.updatedAt.getTime(), new Date(2026, 10, 20, 17, 5, 30).getTime());
});

check("renaming a note reports the old file and writes the new one", () => {
  const previous = [
    note({
      title: "Old Title",
      file: "Old-Title.md",
      createdAt: new Date(2026, 10, 21, 9, 0, 0),
      updatedAt: new Date(2026, 10, 21, 9, 0, 0),
    }),
  ];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Old-Title.md"), "---\ntitle: \"Old Title\"\n---\n\nold\n");

  const { notes, trash } = persistNotes(dir, previous, [{ ...previous[0]!, title: "New Title", file: undefined }]);
  assert.deepEqual(trash, [path.join(dir, "Old-Title.md")]);
  assert.equal(notes[0]?.file, "New-Title.md");
  assert.ok(fs.existsSync(path.join(dir, "New-Title.md")));
});

check("a note removed from the list reports its file", () => {
  const kept = note({ title: "Kept", file: "Kept.md" });
  const gone = note({ title: "Gone", file: "Gone.md", createdAt: new Date(2026, 10, 21, 8, 0, 0) });
  const { trash } = persistNotes(dir, [kept, gone], [kept]);
  assert.deepEqual(trash, [path.join(dir, "Gone.md")]);
});

check("a draft never lands in the folder", () => {
  const draft = note({ title: "Draft note", is_draft: true, file: undefined });
  const { notes } = persistNotes(dir, [], [draft]);
  assert.equal(notes[0]?.file, undefined);
  assert.ok(!fs.existsSync(path.join(dir, "Draft-note.md")));
});

check("an unchanged note is not rewritten", () => {
  const { notes } = persistNotes(dir, [], [note({ title: "Stable" })]);
  const target = path.join(dir, notes[0]!.file!);
  const before = fs.statSync(target).mtimeMs;
  persistNotes(dir, notes, [{ ...notes[0]!, updatedAt: notes[0]!.updatedAt }]);
  assert.equal(fs.statSync(target).mtimeMs, before);
});

fs.rmSync(folder, { recursive: true, force: true });

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
