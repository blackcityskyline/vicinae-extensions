# Shell History

Search what you have typed, across zsh, bash and fish at once, newest first.

| Action | Shortcut |
| --- | --- |
| Run in Terminal | `ctrl+enter` |
| Copy Command | `cmd+c` |
| Paste Command into Focused Window | `cmd+return` |
| Show History File | `cmd+o` |
| Reload | `cmd+r` |

A dropdown in the search bar filters by shell. Files are read directly:

| Shell | File |
| --- | --- |
| zsh | `~/.zsh_history` |
| bash | `~/.bash_history` |
| fish | `~/.local/share/fish/fish_history` |

## The list masks secrets; Copy hands you the real command

The list is on screen while people screen-share, record demos and screenshot
bugs. So what is displayed goes through `maskSecrets`, and what goes on the
clipboard is the command that actually ran — with `concealed`, so a token is
not left sitting in the clipboard history.

```ts
await Clipboard.copy(entry.command, { concealed: true });
```

What gets masked: credentials in assignments (`TOKEN=…`, `AWS_SECRET_ACCESS_KEY=…`,
`DB_PASSWORD=…`), long options that take a value (`--password`, `--api-key`,
`--token`), `Authorization` headers whatever the scheme, token-shaped literals
(`ghp_…`, `github_pat_…`, `glpat-…`, `xoxb-…`, `sk-…`, `AIza…`), and mysql's
attached `-pSECRET`.

### Two things it deliberately does not do

**`-p` with a space is left alone.** `mysql -p hunter2` and `ssh -p 2222` are
the same three characters. Masking every port in a history would make the list
useless, so only mysql's attached form is masked — and that one is restricted to
the command name, because `-pix_fmt`, `-preset` and `-profile` all start with the
same two characters and masking those turns every ffmpeg line into noise.

**A line containing `Authorization` and nothing else is masked anyway.** On this
machine that is 2 lines out of 6361: `"authorization": authorization,` in a
config file. Nothing is hidden that was not already a placeholder. The
alternative is guessing that a line with the word `authorization` in it holds no
credential, and getting that wrong once is worse than two unreadable rows.

## Ctrl+Enter opens a terminal and runs the command

The terminal is a preference. `auto` prefers `xdg-terminal-exec` when it is
installed — this machine has `~/.config/xdg-terminals.list` — and otherwise takes
the first emulator found on PATH.

The command runs in **the shell it came from**, so a fish entry is not handed to
bash, and an interactive shell of that same shell is left behind so the output
stays on screen.

```ts
const RUN_SCRIPT = `eval "$${COMMAND_VAR}"; exec "$${SHELL_VAR}" -i`;
```

Three things that had to be got right:

**The command goes in the environment, not in argv.** argv is world-readable
through `/proc`, and a history entry may hold a token. It has to be the
environment for a second reason: `"$1"` in a `-c` script is not re-parsed, so
bash tries to run `a; b` as a program literally named `a; b`. Verified — the
first version silently did nothing.

**The script is one constant for all three shells.** zsh, bash and fish all
agree on `eval "$VAR"` and `exec "$BIN" -i"`, and disagree on how `-c` takes its
positional arguments. Passing the values through the environment sidesteps that
entirely.

**`xfce4-terminal -e` takes one string, not an argv.** It gets
`'/usr/bin/fish -c <script>'`; everything else gets the argv form.

| Terminal | argv before the program | Source | Run here |
| --- | --- | --- | --- |
| foot | none — `foot fish -c …` | `-e` documented as ignored | yes, 1.28.0 |
| kitty | none — `kitty fish -c …` | `--help` | yes |
| st | none — `st fish -c …` | its own `x.c` usage: `[[-e] command [args ...]]` | no |
| xdg-terminal-exec | none | freedesktop spec | helper not installed |
| alacritty | `-e` | `--help` | yes, 0.17.0 |
| urxvt | `-e` argv | `urxvt(1)` | no |
| xterm | `-e` argv | xterm convention | no |
| gnome-terminal | `--` argv | gnome-terminal docs | no |
| konsole | `-e` argv | konsole docs | no |
| terminator | `-x` argv | `terminator(1)`: "Execute the remainder of the command line" | no |
| mate-terminal | `-x` argv | `mate-terminal(1)`: same wording | no |
| wezterm | `start --` | wezterm docs | no |
| ghostty | `-e` | ghostty docs | no |
| xfce4-terminal | `-e`, **one string** | `xfce4-terminal --help` | no |
| lxterminal | `-e`, **one string** | `lxterminal(1)`: "must be the last option" | no |

Three details that are easy to get wrong and are checked:

- **`terminator` and `mate-terminal` want `-x`, not `-e`.** Both man pages define
  `-x, --execute` as "the remainder of the command line" and `-e` as one string,
  and `-e` would truncate the command.
- **`st` needs no flag at all.** Its usage reads `[[-e] command [args ...]]` and
  its `case 'e'` only skips the flag before jumping to the command.
- **`xfce4-terminal` and `lxterminal` take one string**, so shell and script
  travel together as `'/usr/bin/fish -c <script>'`.

Only foot, kitty and alacritty were run for real: each opened, executed the
command and exited. Every other row is taken from that terminal's own
documentation, and `../UNVERIFIED.md` lists what still has to be run.

**Not included: tilix, qterminal, deepin-terminal, sakura, guake, yakuake.** Their
upstream source was not reachable to confirm how their `-e` splits its argument,
and guessing is how a window ends up running a truncated command. Add them with
their flag once someone can check.

## Timestamps are formatted by hand

`toLocaleString()` with no locale produced `3/10/2026, 4:59:12 AM` here: month
first and a twelve-hour clock. `formatTimestamp` renders `dd.MM.yyyy HH:mm` in
local time instead, so the day comes first, midnight is `00:00`, and the output
does not change with the machine's locale.

An entry with no timestamp shows `—`.

## Why the newest history was missing

The list caps at 5000 entries **per shell**. Taking the first 5000 of a file
written oldest-first kept 2025-12 to 2026-03 and dropped the most recent six
months — which is exactly what the list showed until a user reported that the
newest entry was half a year old. It takes the last 5000 now, and there is a
check that says so.

Per shell rather than one shared cap, because fish has five times the entries of
bash here and a shared cap removed every bash command from the list entirely.

**bash rows show `—`.** bash only writes `#<epoch>` markers when `HISTTIMEFORMAT`
is set in the shell it ran in, and it is not set here, so there is no date to
show. Adding `export HISTTIMEFORMAT='%F %T'` to `~/.bashrc` makes bash write
them from the next session on. Entries with no timestamp sort below dated ones
and keep their file order among themselves.

## The three parsers, and two upstream bugs they fix

Checked against real files on this machine: bash 1520 lines, fish 19511 entries.

- **bash** writes `#<epoch>` before a command when `HISTTIMEFORMAT` is set.
  Upstream lists those as commands, so searching a timestamped history shows
  `#1740000000` as something you ran. Here a timestamp line is metadata for the
  next line and is never listed.
- **fish** writes a bare `- cmd:` with no `when:` to start a session. Upstream
  requires both, so every entry without a timestamp is dropped. Here a command
  with no timestamp is kept, without a time.
- **fish** escapes a newline inside one command as a literal `\n`, and upstream
  splits on that anyway. Here it is unescaped, so a multi-line command is one
  entry — 310 of them on this machine.
- **zsh** `: <started>:<elapsed>;<command>` with a trailing backslash for a
  continued line, joined back into one entry.

## Ported from Raycast

Upstream, MIT: [koinzhang/shell-history](https://github.com/koinzhang/raycast-extensions)
via the [niall-maloney/raycast-extensions](https://github.com/niall-maloney/raycast-extensions)
mirror.

### What changed

**No subprocess to find the history file.** Upstream asks the shell itself —
`spawnSync("zsh", ["-i", "-c", "'echo $HISTFILE'"], { shell: true })` — which is
a shell string with a value spliced into it, and an interactive shell start per
shell on every launch. The default paths are used instead.

**No dependencies.** `read-last-lines` and `shell-quote` went away with the
tail-reading and CLI-parsing they were there for.

**One setting instead of seven.** `maxLines`, `historyTimestamp`,
`removeDuplicates`, `rememberShellTag`, `primaryAction`, `showTips`,
`displayOrder` are all preferences upstream. The shell filter is a dropdown in
the search bar, and the rest are behaviour nobody asked to change.

### Dropped

- **Clear history.** Upstream moves the history file to the trash. That is one
  keystroke away from losing every command, and the shell's own
  `history -c` does the same thing visibly.
- **Upstream's own execution path**, which runs a command through AppleScript
  and Terminal.app. On Linux `Ctrl+Enter` spawns the terminal directly.

## Not covered

`HISTFILE` is set in the shell's own configuration and not exported, so an
extension cannot see it. A shell with a non-default `HISTFILE` is not read; its
commands are simply absent from the list. The paths are printed in the empty
state when a file is missing.
