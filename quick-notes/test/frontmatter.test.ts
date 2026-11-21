import assert from "node:assert/strict";

import { parseMarkdownNote, serializeNoteToMarkdown } from "../src/utils/frontmatter.ts";
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

const note = (overrides: Partial<Note> = {}): Note => ({
  title: "Hello Note",
  icon: "BlankDocument",
  body: "Some **markdown** body",
  tags: [],
  is_draft: false,
  createdAt: new Date(2026, 10, 20, 16, 42, 12),
  updatedAt: new Date(2026, 10, 20, 16, 42, 12),
  ...overrides,
});

check("roundtrip keeps title, icon, tags, body and dates", () => {
  const original = note({ tags: ["work", "ideas"] });
  const parsed = parseMarkdownNote(serializeNoteToMarkdown(original));
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.title, original.title);
  assert.equal(parsed.icon, original.icon);
  assert.deepEqual(parsed.tags, original.tags);
  assert.equal(parsed.body, original.body);
  assert.equal(parsed.createdAt?.getTime(), original.createdAt.getTime());
  assert.equal(parsed.updatedAt?.getTime(), original.updatedAt.getTime());
});

check("a serialized file carries the expected frontmatter and H1", () => {
  assert.equal(
    serializeNoteToMarkdown(note({ tags: ["work"] })),
    `---
title: "Hello Note"
date: 2026-11-20 16:42:12
updated: 2026-11-20 16:42:12
icon: "BlankDocument"
tags: ["work"]
---

# Hello Note

Some **markdown** body
`,
  );
});

check("omits icon and tags when absent", () => {
  const text = serializeNoteToMarkdown(note({ icon: undefined, tags: [] }));
  assert.equal(
    text,
    `---
title: "Hello Note"
date: 2026-11-20 16:42:12
updated: 2026-11-20 16:42:12
---

# Hello Note

Some **markdown** body
`,
  );
});

check("a body that already opens with the H1 is not duplicated", () => {
  const text = serializeNoteToMarkdown(note({ body: "# Hello Note\n\nBody" }));
  assert.equal(text.match(/# Hello Note/g)?.length, 1);
  assert.equal(parseMarkdownNote(text).body, "Body");
});

check("quotes and backslashes survive the roundtrip", () => {
  const title = 'Say "hi" \\ bye';
  const parsed = parseMarkdownNote(serializeNoteToMarkdown(note({ title })));
  assert.equal(parsed.title, title);
});

check("parses an Obsidian-style file with block tags", () => {
  const parsed = parseMarkdownNote(`---
title: Meeting notes
date: 2026-11-19 10:00:00
tags:
  - work
  - "follow-up"
---

# Meeting notes

Discussed the port.
`);
  assert.equal(parsed.title, "Meeting notes");
  assert.deepEqual(parsed.tags, ["work", "follow-up"]);
  assert.equal(parsed.body, "Discussed the port.");
  assert.equal(parsed.createdAt?.getTime(), new Date(2026, 10, 19, 10, 0, 0).getTime());
});

check("a file without frontmatter keeps its body and reports no frontmatter", () => {
  const parsed = parseMarkdownNote("Just a plain note\n");
  assert.equal(parsed.hasFrontmatter, false);
  assert.equal(parsed.body, "Just a plain note");
  assert.equal(parsed.title, undefined);
});

check("an invalid date is ignored", () => {
  const parsed = parseMarkdownNote("---\ntitle: Broken\ndate: not-a-date\n---\n\nBody\n");
  assert.equal(parsed.title, "Broken");
  assert.equal(parsed.createdAt, undefined);
});

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
