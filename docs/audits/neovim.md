# Neovim, measured through its own headless mode

Measured on 2026-11-12 against `nvim 0.12.6` (LuaJIT 2.1.1794214635, Arch), a
LazyVim configuration with 42 lazy plugins, and persistence.nvim's session
directory. No daemon, no socket, nothing running beforehand.

## What the machine already gives

| Route | Measured |
| --- | --- |
| `nvim --headless -S script.lua` | 0.22 s wall time, exit 0. The whole user config loads: 166 normal-mode keymaps, with which-key's descriptions |
| where `print()` goes | **stderr**. stdout was 0 bytes; stderr was exactly the JSON payload, one line, 8641 bytes, no trailing newline, no startup noise |
| leftovers after exit | no `nvim`, `lua-language-server`, `clangd` or swap file; the run is bounded by the script's own `q!` |
| `nvim --headless -S <session> -c 'lua print(getcwd())'` | prints the session's `cd` target (`/home/black`), and the session file is left byte-identical |
| sessions | `~/.local/state/nvim/sessions`, 389 `persistence.nvim` files, `%` → `/` and `%%` → literal `%`; newest ones are real projects |
| plugins | `~/.local/share/nvim/lazy`, 42 directories, **42/42** carry a `url =` in `.git/config`; `~/.config/nvim/lazy-lock.json` carries name, branch and commit |
| a running instance | no `nvr`, no socket under `/run/user/1000`; there is nothing to attach to, so "remote control the editor you have open" needs a plugin on the Neovim side |
| `runInTerminal` | works here: a throwaway extension ran `sh -c 'echo …'` in a terminal window, the window closed on its own, and the promise resolved. No `xdg-terminal-exec` and no `TERMINAL` are installed or set |

## Upstream

`raycast/extensions` → `extensions/neovim` by RG-IL, last touched 2026-11-12. 1400
lines across 15 files, five commands, `platforms: ["macOS"]`, dependencies
`@raycast/api`, `@raycast/utils` and `tildify`.

| Command | Mode | What it really does |
| --- | --- | --- |
| `search-recent-sessions` | view | Lists `~/.local/state/nvim/sessions` plus a JSON list of recent directories it keeps in Raycast's `supportPath`; opens one as `nvim -S` |
| `open-with-neovim` | no-view | `getSelectedFinderItems()` then a terminal launch per macOS terminal app |
| `open-new-window` | no-view | `nvim` in a terminal |
| `show-plugins` | view | `lazy-lock.json`, with GitHub URLs guessed from a 60-entry publisher map |
| `neovim-commands` | view | Writes a Lua dump to `/tmp`, runs `nvim --headless -S`, parses the JSON out of stderr, merges 198 lines of built-in keymap data |

Nothing here is a macOS API except the Finder selection and the AppleScript
launches; the rest is files and one subprocess.

## Why a port

Upstream is a deploy candidate: no macOS-only logic in the three real commands. It
fails on measurement in four places, three of them dead weight:

| Cut | Reason |
| --- | --- |
| `lib/nvim.ts` terminal matrix (~110 lines) | iTerm2 via AppleScript, Ghostty and Terminal.app via `open -a`, plus kitty, Alacritty and WezTerm. `runInTerminal` measured working here covers all of them, follows `xdg-terminal-exec`, and needs no `tildify` |
| `tildify` | Used to shorten the working directory for display. `~` is `os.homedir()` and one `startsWith` |
| `supports/recent-dirs` (`trackRecentDir`, ~40 lines) | A second registry beside persistence.nvim's 389 sessions, written on every open. The sessions directory already answers "which projects did I work in" |
| `lib/plugins.ts` publisher map (60 lines) | Guesses `https://github.com/<publisher>/<name>` for a whitelist. All 42 installed plugins have a real `origin` URL in `.git/config` |
| `lib/json-framing.ts` (53 lines) | A bracket scanner that finds the payload among startup noise. Measured: stderr is the payload and nothing else, so the last line is the JSON |
| `lib/builtins.ts` (198 lines) | A static "these keys exist" table. The dump already carries the user's real keymaps with descriptions; the table hides what the config actually binds |
| `layout` preference (`list`/`grid`) | One more setting for one view. Lists are the shape of all three commands |
| `open-with-neovim` | `getSelectedFinderItems()` does not exist in `@vicinae/api` — only `getSelectedText()` — so there is no file selection to hand it. Opening a *path* typed or pasted is a form, not a Finder command |

What stays is upstream's shape: four of its five commands, three of its five ideas
(sessions, plugins, keymaps), and `nvimPath` as the only preference. Out: the
terminal dropdown, which is now Vicinae's.

Estimated size: ~420 lines, no runtime dependency.

## Second pass, re-read at `c33bf4c`

The first version cut four upstream behaviours. Re-read against the same source at
`c33bf4c`, three of them are load-bearing and one is dead weight:

| Upstream | Verdict |
| --- | --- |
| `lib/pinned.ts` — pinned entries in `LocalStorage`, Pinned section above Recent | **Ported.** It is the only ordering the user controls; persistence.nvim sorts by mtime alone |
| `supports/recent-dirs` — a `supportPath` JSON of directories opened from the extension | **Ported.** Measured on the re-read: `~/.local/state/nvim/sessions` holds 391 files and **none** under `/tmp`, so a scratch directory opened from here has no session and never appears. The second registry is what makes it appear |
| `layout` preference (`list`/`grid`) | **Ported.** Two renderings of the same three views, chosen once |
| `open-with-neovim` + `getSelectedFinderItems()` | **Half-ported.** The Finder selection does not exist in `@vicinae/api`, so the command is a `view` FilePicker prefilled from the clipboard, not a `no-view` command reading a selection. A `no-view` command cannot read the clipboard either — `Clipboard.readText()` returns `""` there |
| `lib/nvim.ts` terminal matrix, `tildify`, the publisher map, `json-framing.ts`, `builtins.ts` | Still cut, for the reasons above |

Upstream's session list merges two sources and dedupes on the path, newest first,
and its `trackRecentDir` resolves a file to its parent directory, moves an existing
entry to the front and caps the list at 50. Those are the rules ported into
`src/lib/entries.ts`, which is where the tests point.

## What ran live

Driven on 2026-11-13 against Vicinae 0.30.0, `nvim 0.12.6`, window captured with
`grim` and read with `tesseract`.

| Step | Result |
| --- | --- |
| Session list | Two sections; **Pinned** empty, **Recent Sessions** listing 391 persistence sessions newest first, each with the source tag and its age; the temporary directory had no session row until the next step |
| Pin | `ctrl+shift+p` on `parity` moved it into **Pinned** and out of the recent list in the same frame |
| Relaunch | The pinned row survived quitting and relaunching: the JSON came back from `LocalStorage` |
| Unpin | The same key removed the section and `parity` returned to the recent list |
| Recent directory | `open-with-neovim` on `/tmp/opencode` wrote `neovim-recent-dirs.json` and the directory appeared at the top of the list, which no saved session covered before |
| Open with Neovim | The picker arrived prefilled from the clipboard and `ctrl+s` ran `foot --title Neovim --working-directory /tmp/opencode -e nvim /tmp/opencode/nv-sample.txt`; the launcher closed itself |
| Grid | Rebuilt with `layout` defaulting to `grid`: plugins rendered as a five-column icon grid, names and branch subtitles intact; reverted to `list` and rebuilt |

The recent file is `~/.local/share/vicinae/support/neovim/neovim-recent-dirs.json`,
written on every launch the extension performs and capped at 50 entries.
