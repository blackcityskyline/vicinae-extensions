# Audit: Neovim, measured through its own headless mode

Measured on this machine on 2026-11-12 against `nvim 0.12.6` (LuaJIT 2.1.1794214635,
Arch), a LazyVim configuration with 42 lazy plugins, and persistence.nvim's session
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

Two of those facts decide the shape of the extension. `print()` on stderr means the
keymap dump is one `execFile` and one `JSON.parse`, not a framing problem. And a
platform call that opens a terminal means there is no terminal matrix to write.

## Upstream, measured

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

Nothing here is a macOS API except the Finder selection and the AppleScript launches;
the rest is files and one subprocess.

## Why a port, not a deploy

The upstream is a deploy candidate: no macOS-only logic in the three real commands.
It fails on measurement in four places, three of them dead weight:

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

## What the extension has to prove

- Sessions: the 389 files are listed with a readable name, newest first, and opening
  one runs `nvim -S <path>` in a terminal; a directory with no session is not invented.
- Plugins: 42 rows with branch and short commit; the repository link is the measured
  `origin` URL, and a plugin without one shows no link rather than a guess.
- Keymaps: the dump is read from stderr, a config that prints something else does not
  break the parse, and a missing `nvim` says so.
- New window: one terminal, no clipboard access.
