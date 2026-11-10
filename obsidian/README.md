# Obsidian

Search, open, create and edit notes in an Obsidian vault from the launcher, plus
bookmarks, daily notes, media search, tasks and custom append actions.

## Commands

| Command | What it does |
| --- | --- |
| Search Note | Find a note by name or content, preview it, open, copy, paste or edit it |
| Bookmarked Notes | The notes bookmarked in Obsidian, same actions |
| Open Vault | Open a vault in Obsidian |
| Open Workspace | Open a saved workspace, when the Advanced URI plugin is installed |
| Daily Note | Open today's daily note; the core Daily Notes plugin must be on |
| Append to Daily Note | Append or prepend text, optionally under a heading, without opening the note |
| Append Task | Append a task line to a note, with a tag and an optional creation date |
| Create Note | Create a note from a template, with folders, tags and per-folder actions |
| Random Note | Open a random note, or preview it first |
| Search Media | Images, audio and video in the vault, in a grid |
| Custom Actions | Manage reusable append actions and run them against a note |
| Quick Capture | Save one line into the daily note, a todo note or a shopping note |

## Vaults

The extension reads the vault list from `$XDG_CONFIG_HOME/obsidian/obsidian.json`
(`~/.config/obsidian/obsidian.json` by default), which Obsidian keeps up to date.
The **Path to Vault** preference overrides it and takes a comma separated list.

Some commands need Obsidian plugins: **Advanced URI** for workspace opening,
new-pane opens and appending through URIs, and the core **Daily Notes** plugin for
the daily note commands. The extension says so when they are missing.

## Where the values come from

- Notes are found by walking the vault with `fast-glob`; `excludedFolders` (and
  Obsidian's own exclusion settings) remove directories.
- Name and path search is Fuse.js; **Search Content** also reads note bodies with
  minisearch and shows the matching lines.
- Frontmatter, LaTeX, links and inline tags are stripped for the preview according
  to the global preferences.
- The caret jump for "Open Match in Obsidian" uses the Obsidian CLI, which ships
  with the macOS app; on other platforms the note opens at its last position.
  Opening a note itself always works through the `obsidian://` scheme.
- Custom actions live in Vicinae's extension storage, not in the vault.

## Verification

`npm test` runs the ported vitest suite (25 files, 380 tests) against real
temporary vaults: note crawling, bookmarks, YAML, callouts, templating, search,
custom actions and the Obsidian config readers.

```bash
npm run lint && npm run check && npm test && npm run build
vicinae cmd launch @black/obsidian:searchNoteCommand
```
