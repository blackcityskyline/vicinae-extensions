# Todo List

A todo list that lives in a file you can read and edit: one list per day at
`~/Documents/Todo/YYYY-MM-DD/todo.md`, in the
[Obsidian Tasks](https://publish.obsidian.md/tasks/) emoji syntax.

Port of [`maggie/todo-list`](https://github.com/raycast/extensions/tree/main/extensions/todo-list)
(MIT); the storage format and the cuts below are the only changes.

## Commands

- **Manage Todo List** — type in the search bar to add a task, `Enter` adds it.
  Sections are Pinned, Todo and Completed; the dropdown filters by tag. On a row:
  pin (`ctrl+alt+p`), priority (`ctrl+shift+p`), tag (`ctrl+t`), due date
  (`ctrl+shift+e`), edit (`ctrl+e`), delete (`ctrl+d`); `ctrl+o` opens a URL in
  the title.
- **Export Todo Backup** — writes today's list as formatted JSON to a folder you
  pick.
- **Import Todo Backup** — restores a markdown todo file or a JSON backup,
  keeping the file it replaces as a timestamped `.backup` beside it.

**Natural Language Parsing** (off by default) pulls a due date, a `#tag` and a
`!h`/`!m`/`!l` priority out of the typed line.

## The file

```markdown
# Todo

## Pinned

## Todo

- [ ] Buy milk #errand 📅 2026-11-21 ⏫ ➕ 2026-11-20

## Completed

- [x] Done ➕ 2026-11-20
```

`#tag`, `📅` due date, `➕` created date, and `⏫` high / `🔼` mid / `🔽` low
priority. The checkbox is the completion truth: a checked line under `## Todo`
lists as completed, and `## Pinned` is the only heading that changes the
section. A task without `➕` keeps no creation time and sorts oldest; tasks
written by the extension always get one. Hand edits show up on the next launch.

Dates are day-granular in the file, which is what Obsidian Tasks reads; the
launcher's time of day is not kept across a restart. Order inside a section is
preserved, so tasks created on the same day keep the order they were added.

## Storage

Each launch resolves the file from the local date, so yesterday's list stays as
it was left; unfinished tasks do not carry over. Writes use upstream's `O_EXCL`
lock file, a revision check against a second command, a `todo.md.backup` and a
`0600` temporary renamed into place. A command left open across midnight keeps
writing to the folder it opened in.

The first read of a day that still has the old `todo.json` beside a missing
`todo.md` converts it, leaving the JSON in place. Import accepts both the
markdown file and the JSON backup, and Export is still JSON.

## Not ported

The menu-bar command, its `completed` preference, the two AI tools and the
confetti action.

`npm run build` installs to `~/.local/share/vicinae/extensions/todo-list`.
