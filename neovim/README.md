# neovim

Sessions, plugins and keymaps of the Neovim configuration on this machine. Nothing
runs inside Neovim: sessions are files, plugins are `lazy.nvim`'s own bookkeeping,
and keymaps come from one headless run.

| Command | What it does |
| --- | --- |
| Search Recent Sessions | `persistence.nvim`'s saved sessions, newest first; Enter opens one with `nvim -S` |
| Show Installed Plugins | Every plugin in `lazy-lock.json` with its branch, short commit and repository |
| Search Keymaps | The config's normal-mode keymaps, read through `nvim --headless` |
| Open New Window | `nvim` in a new terminal window, in `~` |

One preference: `Neovim Binary`, `nvim` from `PATH` by default.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Sessions | Open Session | `ctrl+o` (`open`) |
| Sessions | Copy Directory | `ctrl+shift+,` (`copy-path`) |
| Sessions | Refresh | `ctrl+r` (`refresh`) |
| Sessions | Delete Session | `ctrl+shift+x` (`remove-all`, asks first) |
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
- `~/.local/state/nvim/sessions` holds 389 sessions; all 42 installed plugins have
  a real `origin` URL in `.git/config`.
- `runInTerminal` opens `foot` here (`foot --title Neovim --working-directory … -e
  nvim`, from the Vicinae log) with neither `xdg-terminal-exec` nor `TERMINAL` set,
  so upstream's six-terminal matrix is unnecessary.
- A session whose directory has been deleted since is tagged `Missing` instead of
  disappearing.

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

Upstream is `raycast/extensions/extensions/neovim` (RG-IL), 1400 lines and five
commands, `platforms: ["macOS"]`. Four commands remain; `open-with-neovim` is gone
because Vicinae has no file selection to read (`getSelectedFinderItems` does not
exist, only `getSelectedText`). The terminal matrix, the recent-directories
registry, the GitHub publisher map, the JSON framing, the static builtin keymap
table and the `tildify` dependency were cut on measurement — see
[`docs/audits/neovim.md`](../docs/audits/neovim.md).
