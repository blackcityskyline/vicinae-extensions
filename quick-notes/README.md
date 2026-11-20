# Quick Notes

Markdown notes in the launcher, kept in a folder of your choice as plain files.

Ported from [raycast/extensions · quick-notes @ e1647d3](https://github.com/raycast/extensions/tree/e1647d33c6cc03d4312f764de100bdd331401a73/extensions/quick-notes).
Notes are stored in `~/.local/share/vicinae/support/quick-notes/quick-notes.json`;
tags in `tags.json` beside it. Nothing leaves the machine.

## Commands

| Command | What it does |
| ------- | ------------ |
| View Notes | List, search, open, edit and delete notes; a detail pane shows the note body and its metadata |
| Create Note | The same form, pre-filled from the `Title` and `Note` arguments |
| Manage Tags | Create, edit and delete tags; deleting a tag removes it from every note |
| Search Notes | View Notes with the `Search` and `Tag` arguments already applied |
| Export Notes | Copy every note into a folder once |
| Import Notes | Read `.md` files into the notes store |
| Sync with Folder | Two-way sync with the folder from the preference; disabled by default, runs every 10 minutes |

## Preferences

`Auto Save Location` (optional): the folder that mirrors the notes as `.md`
files. With it set, every save writes the folder and every rename or delete
moves the old file to the Trash through `gio trash`. Without it the notes live
in the JSON store only.

## Shortcuts

Every action uses the launcher's own binding for its verb — `action.edit`,
`action.copy`, `action.open`, `action.new`, `action.remove`,
`action.remove-all`, `action.save`, `toggle-action-panel` — so they follow your
`keybinds` in the Vicinae config. Actions with no standard verb:

| Action | Shortcut |
| ------ | -------- |
| Apply / Remove Tag | `ctrl+shift+t` |
| New Tag | `ctrl+shift+n` |
| Sort | `ctrl+s` |
| Open Extension Preferences | `ctrl+alt+,` |

## Markdown files

A note is written with YAML frontmatter and an H1, so the folder works in
Obsidian, Jekyll or any editor:

```markdown
---
title: "Your Blog Post Title"
date: 2026-05-07 10:00:00
icon: "BlankDocument"
tags: ["example", "jekyll"]
---

# Your Blog Post Title

Your note body...
```

The frontmatter and the generated H1 are stripped again on sync, so the body in
the launcher stays clean. Tags found in a file's frontmatter — inline
`tags: ["a", "b"]` or a block list of `- a` lines — are imported and registered
as tags. A title edited in the frontmatter renames the note and the file, and the
superseded file goes to the Trash.

## What the port cut

- **AI summaries.** `@vicinae/api`'s `AI.ask` throws `not implemented`, yet
  `environment.canAccess(AI)` reports success, so the action would sit there and
  always fail. It is gone, along with the `summary` field and the two actions
  around it.
- **The macOS shortcut table.** One `ctrl`-based shortcut per action replaces
  the per-platform pairs.
- **`trash()`.** Vicinae's `trash()` is `rm -r`; deletions call
  `gio trash <file>` instead.
- **Toast `primaryAction`.** Not in `@vicinae/api`; the missing-folder toasts
  name the fix and `ctrl+alt+,` opens the preferences.

`Icon.Document` does not exist either — Vicinae's name for it is
`BlankDocument`, which is the default icon.

## Verified by hand

On `@vicinae/api` 0.29.1: creating a note writes both the JSON store and
`<folder>/<slug>.md`; sync imports a hand-written file with frontmatter, adds a
tag found in it and rewrites every file in the folder; deleting a note moves its
file to the Trash (`~/.local/share/Trash/info/<name>.md.trashinfo`); deleting a
tag empties `tags.json`; applying and removing a tag rewrites the note and its
frontmatter; `Search Notes` filters by its argument and by typing, with an empty
list for a miss; the list, detail pane, action panel, the tag form and the
preferences page all render.

Not verified: Export Notes and Import Notes through their file pickers (the
folder or files picked by hand) — the export writer itself is the same one the
autosave path exercises.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # frontmatter roundtrip and Obsidian block-list checks
npm run check   # tsc --noEmit with noUnusedLocals
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/quick-notes/<command>'
```
