# Shell History

Search what you have typed, across zsh, bash and fish at once, newest first.

| Action | Key |
| --- | --- |
| Paste into Focused Window | `return` |
| Copy Command | `ctrl+return` |
| Run in Terminal | `ctrl+x` |
| Show History File | `cmd+o` |
| Reload | `cmd+r` |
| Delete from History | `ctrl+d` |
| Delete All History | `ctrl+shift+d` |

A dropdown in the search bar filters by shell. Files are read directly:
`~/.zsh_history`, `~/.bash_history`, `~/.local/share/fish/fish_history`.

## Secrets

The list masks credentials (`TOKEN=…`, `--password`, `Authorization`, `ghp_…`,
`sk-…`, mysql's attached `-pSECRET`) because it is on screen while people record
and screen-share. Copy puts the real command on the clipboard with `concealed`,
so it is not indexed in the clipboard history.

Not masked: `-p` followed by a space, since `mysql -p hunter2` and `ssh -p 2222`
are the same characters. A line that mentions `authorization` is masked anyway.

## Deleting

`ctrl+d` removes one entry from the shell's file, `ctrl+shift+d` empties all
three; both ask first. The write is a temp file renamed over the original, with
its mode kept. It matches the command text and the timestamp, so of two identical
commands the one picked goes; with no timestamp, the newest match.

A running shell keeps its history in memory and writes it back on exit, so a
deleted entry can return. Close it, or run `history -a` (`history clear` in fish).

## Run in Terminal

`ctrl+x` opens the terminal set in the preferences (`auto` prefers
`xdg-terminal-exec`, then the first emulator on PATH) and runs the command in the
shell it came from, leaving an interactive shell of that kind behind. The command
travels in the environment, not in argv: argv is readable through `/proc` and a
history entry may hold a token.

| Terminal | Form |
| --- | --- |
| foot, kitty, st, xdg-terminal-exec | `term shell -c …`, no flag |
| alacritty, urxvt, xterm, konsole, ghostty | `-e` with argv |
| gnome-terminal | `--` with argv |
| wezterm | `start --` |
| terminator, mate-terminal | `-x`, the rest of the line |
| xfce4-terminal, lxterminal | `-e` with **one string** |

Only foot, kitty and alacritty were run. tilix, qterminal, deepin-terminal,
sakura, guake and yakuake are absent: how their `-e` splits its argument could
not be confirmed.

## Settings

| Preference | Default | Values |
| --- | --- | --- |
| Terminal | `auto` | which emulator `ctrl+x` opens |
| Date Format | `dotted` | `dotted`, `dmy`, `mdy`, `iso` |
| History Entries | `all` | `500`, `1000`, `2500`, `5000`, `all` per shell |

## Limits

- Only the last 400 KB of each file is parsed at launch; scrolling pages the rest.
- bash writes `#<epoch>` markers only with `HISTTIMEFORMAT` set, so bash rows show
  `—` until `export HISTTIMEFORMAT='%F %T'` is added to `~/.bashrc`.
- A shell with `HISTFILE` somewhere else is not read; the default paths are
  printed when a file is missing.
- Clear history is not offered: upstream's trash move is one keystroke from
  losing everything, and the shell's `history -c` does it visibly.
- Ported from [koinzhang/shell-history](https://github.com/koinzhang/raycast-extensions),
  MIT, without its `spawnSync` HISTFILE probe and its dependencies.
