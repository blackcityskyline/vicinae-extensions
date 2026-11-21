# Quick Notes

Markdown notes in the launcher, stored as plain `.md` files in
`~/Documents/Notes/Quick` (the `Notes Folder` preference moves it). Obsidian,
Logseq and a plain editor read and edit the same files; the folder is the only
store.

Ported from [raycast/extensions · quick-notes @ e1647d3](https://github.com/raycast/extensions/tree/e1647d33c6cc03d4312f764de100bdd331401a73/extensions/quick-notes).
Unsaved drafts and tag colours live in
`~/.local/share/vicinae/support/quick-notes/`. Nothing leaves the machine.

## Commands

| Command | What it does |
| ------- | ------------ |
| View Notes | List, search, open, edit and delete notes; a detail pane shows the note body and its metadata |
| Create Note | The same form, pre-filled from the `Title` and `Note` arguments |
| Manage Tags | Create, edit and delete tags; deleting a tag removes it from every note |
| Search Notes | View Notes with the `Search` and `Tag` arguments already applied |
| Import Notes | Copy chosen `.md` files into the notes folder |

## Preferences

`Notes Folder` (optional): defaults to `~/Documents/Notes/Quick`. Every `.md`
file directly in that folder is a note; a subfolder keeps hand-written files
elsewhere in `~/Documents/Notes` out of the launcher. A note is named after its
slugged title, so renaming the title renames the file. A rename or a deletion
moves the old file to the Trash through `gio trash`, because Vicinae's `trash()`
is `rm -r`.

## Markdown files

The file is the note:

```markdown
---
title: "Your Blog Post Title"
date: 2026-05-07 10:00:00
updated: 2026-05-07 10:00:00
icon: "BlankDocument"
tags: ["example", "jekyll"]
---

# Your Blog Post Title

Your note body...
```

The frontmatter and the H1 are stripped in the launcher, so the body stays
clean. Tags found in the frontmatter — inline `tags: ["a", "b"]` or a block list
of `- a` lines — are registered as tags. The title comes from the frontmatter,
then the first H1, then the filename. `date:` and `updated:` are optional and
fall back to the file's timestamps, so a hand-written file needs only its body.
An external title or body edit shows up on the next launch.

## What the port cut

- **AI summaries.** `@vicinae/api`'s `AI.ask` throws `not implemented`, yet
  `environment.canAccess(AI)` reports success, so the action would sit there and
  always fail. It is gone, along with the `summary` field and the two actions
  around it.
- **The JSON store and its 10-minute sync.** The folder holds the notes, so the
  export and sync commands are gone; only unsaved drafts stay in the support
  folder.
- **The macOS shortcut table.** One `ctrl`-based shortcut per action replaces
  the per-platform pairs.
- **`trash()`.** Vicinae's `trash()` is `rm -r`; deletions call
  `gio trash <file>` instead.
- **Toast `primaryAction`.** Not in `@vicinae/api`; the missing-folder toasts
  name the fix and `ctrl+alt+,` opens the preferences.

`Icon.Document` does not exist either — Vicinae's name for it is
`BlankDocument`, which is the default icon.

## Verified by hand

On `@vicinae/api` 0.29.1: creating a note writes `~/Documents/Notes/Quick/<title>.md`
with the frontmatter above and an empty `drafts.json`; an external edit to the
frontmatter title and the H1 is listed under the new title with the edited body;
deleting a note moves its file to the Trash
(`~/.local/share/Trash/info/<name>.md.trashinfo`). The list, detail pane, action
panel, tag form and preferences page render.

Not verified: Import Notes through its file picker (the copy path is the same
one that writes a saved note).

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # frontmatter roundtrip and folder-store checks
npm run check   # tsc --noEmit with noUnusedLocals
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/quick-notes/<command>'
```
