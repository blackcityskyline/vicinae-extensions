# Todo List

A todo list that lives in files you can read: one list per day at
`~/Documents/todo/YYYY-MM-DD/todo.json`.

Port of [`maggie/todo-list`](https://github.com/raycast/extensions/tree/main/extensions/todo-list)
(MIT); the storage path and the cuts below are the only changes.

## Commands

- **Manage Todo List** — type in the search bar to add a task, `Enter` adds it.
  Sections are Pinned, Todo and Completed; the dropdown filters by tag. On a row:
  pin (`ctrl+alt+p`), priority (`ctrl+shift+p`), tag (`ctrl+t`), due date
  (`ctrl+shift+e`), edit (`ctrl+e`), delete (`ctrl+d`); `ctrl+o` opens a URL in
  the title.
- **Export Todo Backup** — writes today's list as formatted JSON to a folder you
  pick.
- **Import Todo Backup** — restores a list, keeping the file it replaces as a
  timestamped `.backup` beside it.

**Natural Language Parsing** (off by default) pulls a due date, a `#tag` and a
`!h`/`!m`/`!l` priority out of the typed line.

## Storage

Each launch resolves the file from the local date, so yesterday's list stays as
it was left; unfinished tasks do not carry over. Writes use upstream's `O_EXCL`
lock file, a revision check against a second command, a `todo.json.backup` and a
`0600` temporary renamed into place. A command left open across midnight keeps
writing to the folder it opened in.

## Not ported

The menu-bar command, its `completed` preference, the two AI tools and the
confetti action.

`npm run build` installs to `~/.local/share/vicinae/extensions/todo-list`.
