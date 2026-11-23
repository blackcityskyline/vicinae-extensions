# Obsidian

Search, open, create and edit notes in an Obsidian vault, plus bookmarks, daily
notes, media search, tasks and reusable append actions.

## Commands

| Command | Does |
| --- | --- |
| Search Note | find by name or content, preview, open, copy, paste or edit |
| Bookmarked Notes | the notes bookmarked in Obsidian |
| Open Vault / Open Workspace | open a vault, or a saved workspace |
| Daily Note / Append to Daily Note | open today's note, or append and prepend text without opening it |
| Append Task | add a task line, with a tag and an optional date |
| Create Note | a template, with folders, tags and per-folder actions |
| Random Note | a random note, or a preview of one |
| Search Media | images, audio and video in a grid |
| Custom Actions | manage append actions and run them against a note |
| Quick Capture | one line into the daily, todo or shopping note |

## Vaults

The list comes from `$XDG_CONFIG_HOME/obsidian/obsidian.json`
(`~/.config/obsidian/obsidian.json`), which Obsidian keeps current. **Path to
Vault** overrides it and takes a comma-separated list.

**Advanced URI**: workspace opening, new-pane opens, appending. The core
**Daily Notes** plugin: the daily note commands. A missing one is named, not
assumed.

## How it reads

- Notes are found by walking the vault (`fast-glob`); `excludedFolders` and
  Obsidian's own exclusions remove directories.
- Name/path search is Fuse.js; **Search Content** reads bodies with minisearch,
  showing matching lines.
- Frontmatter, LaTeX, links and inline tags are stripped from the preview per
  global preferences.
- Notes open via the `obsidian://` scheme; the caret jump uses the Obsidian CLI
  (macOS app); elsewhere the note opens at its last position.
- Custom actions live in Vicinae's storage, not in the vault.

## Not verified

`npm test`: the ported suite (25 files, 380 tests) against real temporary
vaults. Six real vaults; the create/search flows and Quick Capture were seen in
the launcher. Not pressed: the note list after picking a vault, the actions
beyond opening, the media grid, the macOS caret jump.

Ported from the [Raycast Obsidian extension](https://github.com/raycast/extensions/tree/main/extensions/obsidian).
