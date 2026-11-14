# neovim

Sessions, plugins and keymaps of the Neovim configuration. Nothing runs inside
Neovim: sessions are files, plugins are `lazy.nvim`'s bookkeeping, and keymaps
come from one headless run.

| Command | Does |
| --- | --- |
| Search Recent Sessions | `persistence.nvim`'s saved sessions plus directories opened from here, newest first |
| Open with Neovim | pick files or directories, prefilled from the clipboard, and open them in one `nvim` |
| Show Installed Plugins | every plugin in `lazy-lock.json`, with branch, short commit and repository |
| Search Keymaps | normal-mode keymaps, read through `nvim --headless` |
| Open New Window | `nvim` in a new terminal window, in `~` |

Preferences: **Neovim Binary** (`nvim` from `PATH`) and **View Layout** (rows, or
a five-column grid of icons).

## Sessions

**Pinned** is what you pinned, in your order, kept in `LocalStorage` above
everything. **Recent Sessions** merges saved sessions with the directories opened
from here, deduped on the path; opening a directory is what makes a scratch
project appear at the top. A session whose directory is gone is tagged `Missing`.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Sessions | open | `ctrl+o` |
| Sessions | pin / unpin | `ctrl+shift+p` |
| Sessions | move up / down (pinned) | `ctrl+shift+↑` / `ctrl+shift+↓` |
| Sessions | remove from recent | `ctrl+x` |
| Sessions | delete session | `ctrl+shift+x`, asks first |
| Sessions, Plugins, Keymaps | refresh | `ctrl+r` |
| Open with Neovim | submit | `ctrl+s` |
| Plugins, Keymaps | copy | `ctrl+shift+c`, `ctrl+shift+.` |

## The `%` in a session path

`persistence.nvim` writes `/` as `%`, and passing that to `nvim -S` fails with
`E499`: the argument goes through `expand_filename`, where `%` is the current
buffer. Escaping `%`, `#` and space fixes it; the tests check the restored `cd` of
real sessions against the decoded path.

## Limits

Nothing leaves the machine: no network, the plugin list is two local files.
Upstream is `raycast/extensions/extensions/neovim` at `c33bf4c`, `platforms:
["macOS"]`; its Finder selection and `no-view` clipboard read have no Vicinae
equivalent, so `open-with-neovim` is a picker.
[`docs/audits/neovim.md`](../docs/audits/neovim.md) records the measurements.
