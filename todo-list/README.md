# Todo List

A todo list that lives in files you can read. One list per day, saved as

```
~/Documents/todo/2026-11-10/todo.json
```

Port of [`maggie/todo-list`](https://github.com/raycast/extensions/tree/main/extensions/todo-list)
(MIT), deployed as written apart from the storage path and the cuts below.
`docs/audits/todo-list.md` has the measurements.

## Commands

- **Manage Todo List** — type in the search bar to add a task, `⏎` adds it.
  Sections are Pinned, Todo and Completed; tags filter from the dropdown.
  Pinning (`⌃⌥P`), priority (`⌃⇧P`), tag (`⌃T`), due date (`⌃⇧E`), edit
  (`⌃E`) and delete (`⌃D`) are on each row. A URL in the title opens with `⌃O`.
- **Export Todo Backup** — writes today's list as formatted JSON to a folder
  you pick.
- **Import Todo Backup** — restores a list from a backup file, keeping the file
  it replaces as a timestamped `.backup` beside it.

`Natural Language Parsing` (off by default) pulls a due date, a `#tag` and a
`!h`/`!m`/`!l` priority out of the typed line.

## Storage

Each launch resolves the file from the local date, so yesterday's list stays
exactly as it was left. Unfinished tasks do not carry into the next day, and a
pinned task stays in the file of the day it was pinned.

Writes are the upstream ones: an `O_EXCL` lock file, a revision check so a
second command cannot silently overwrite yours, a `todo.json.backup` of the
previous contents, and a `rename` of a `0600` temporary. A command left open
across midnight keeps writing to the folder it opened in.

## Not ported

The menu-bar command, its `completed` preference, the two AI tools and the
confetti action have no Vicinae equivalent or are Raycast-only. Reasons per
feature are in `docs/audits/todo-list.md`.

## Build

```bash
npm install
npm run lint && npm run check && npm test && npm run build
```

`npm run build` installs to `~/.local/share/vicinae/extensions/todo-list`.
