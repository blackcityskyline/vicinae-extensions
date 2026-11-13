# neovim

Sessions, plugins and keymaps of the Neovim configuration on this machine. Nothing
runs inside Neovim: sessions are files, plugins are `lazy.nvim`'s own bookkeeping,
and keymaps come from one headless run.

| Command | What it does |
| --- | --- |
| Search Recent Sessions | `persistence.nvim`'s saved sessions plus the directories opened from here, newest first; Enter opens one |
| Open with Neovim | Pick files or directories (prefilled from the clipboard) and open them in one `nvim` |
| Show Installed Plugins | Every plugin in `lazy-lock.json` with its branch, short commit and repository |
| Search Keymaps | The config's normal-mode keymaps, read through `nvim --headless` |
| Open New Window | `nvim` in a new terminal window, in `~` |

Two preferences: `Neovim Binary` (`nvim` from `PATH` by default) and `View Layout`
(rows, or a five-column grid of icons).

The session list has two sections. **Pinned** is what you pinned, in the order you
put it, kept in `LocalStorage` and shown above everything else. **Recent Sessions**
merges the saved sessions with the directories this extension opened, deduped on the
path; opening a directory from here is what makes a scratch project — one with no
saved session — appear at the top.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Sessions | Open in Neovim | `ctrl+o` (`open`) |
| Sessions | Pin / Unpin Entry | `ctrl+shift+p` (`pin`, a toggle) |
| Sessions | Move Up / Move Down (pinned only) | `ctrl+shift+↑` / `ctrl+shift+↓` (`move-up`, `move-down`) |
| Sessions | Copy Directory | `ctrl+shift+,` (`copy-path`) |
| Sessions | Remove from Recent | `ctrl+x` (`remove`, recent rows only) |
| Sessions | Delete Session | `ctrl+shift+x` (`remove-all`, saved sessions only, asks first) |
| Sessions | Refresh | `ctrl+r` (`refresh`) |
| Open with Neovim | Submit the picker | `ctrl+s` (`save`) |
| Plugins | Open Repository | `ctrl+o` (`open`) |
| Plugins | Copy Commit | `ctrl+shift+c` (`copy`) |
| Plugins | Copy Name | `ctrl+shift+.` (`copy-name`) |
| Plugins | Refresh | `ctrl+r` (`refresh`) |
| Keymaps | Copy Keys | `ctrl+shift+c` (`copy`) |
| Keymaps | Copy `vim.keymap.set` | `ctrl+shift+.` (`copy-name`) |
| Keymaps | Refresh | `ctrl+r` (`refresh`) |

## Measured

On `nvim 0.12.6` with a LazyVim configuration:

- `nvim --headless -S script.lua` takes 0.22 s and loads the whole config: 166
  normal-mode keymaps with descriptions.
- `print()` from that run lands on **stderr**, which carries the JSON payload and
  nothing else, so the parse is "the last line that is an array", not a bracket
  scanner.
- `~/.local/state/nvim/sessions` holds 391 sessions, none of them under `/tmp`; all
  42 installed plugins have a real `origin` URL in `.git/config`.
- `runInTerminal` opens `foot` here (`foot --title Neovim --working-directory … -e
  nvim`, from the Vicinae log) with neither `xdg-terminal-exec` nor `TERMINAL` set,
  so upstream's six-terminal matrix is unnecessary.
- A session whose directory has been deleted since is tagged `Missing` instead of
  disappearing.
- Pinning `parity`, quitting and relaunching showed it under **Pinned** again; the
  same key unpinned it and it fell back into the recent list.
- `View Layout: grid` was checked by building with `grid` as the default: plugins
  rendered as a five-column icon grid, headings intact.
- Open with Neovim arrived prefilled with the clipboard's path, and `ctrl+s`
  started `foot --title Neovim --working-directory /tmp/opencode -e nvim
  /tmp/opencode/nv-sample.txt`; the launcher window closed itself.
- The recent registry it writes is
  `~/.local/share/vicinae/support/neovim/neovim-recent-dirs.json`, and that
  directory then appeared in the session list as `recent`.

## The `%` in a session path

`persistence.nvim` names a session after the directory it was saved in, with `/`
written as `%` — `%home%black%.config%nvim.vim`. Passing that straight to
`nvim -S` fails with `E499: Empty file name for '%' or '#', only works with
':p:h'`: the argument goes through `expand_filename`, where `%` means the current
buffer. The session is never sourced and Neovim silently opens in the current
directory. Escaping the characters (`\%`, `\#`, `\ `) fixes it, and the tests check
the restored `cd` of three real sessions against the decoded path.

## What leaves your machine

Nothing. No network calls: the plugin list is two local files and Neovim runs
without a server.

## Ported, not deployed

Upstream is `raycast/extensions/extensions/neovim` (RG-IL) at `c33bf4c`, 1400 lines
and five commands, `platforms: ["macOS"]`. Its five commands are here; the Finder
selection behind `open-with-neovim` is not, so that command is a picker, and a
`no-view` command could not read the clipboard either. The terminal matrix, the
GitHub publisher map, the JSON framing and the static builtin keymap table stay cut
on measurement — see [`docs/audits/neovim.md`](../docs/audits/neovim.md).
