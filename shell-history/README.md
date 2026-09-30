# Shell History

Search what you have typed, across zsh, bash and fish at once, newest first.

| Action | Shortcut |
| --- | --- |
| Copy Command | `cmd+c` |
| Paste Command into Terminal | `cmd+return` |
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
- **Running a command**, which upstream offers as "Execute in Terminal". Copy and
  paste puts it in front of you first; executing a stored string without showing
  it is not something this extension does.

## Not covered

`HISTFILE` is set in the shell's own configuration and not exported, so an
extension cannot see it. A shell with a non-default `HISTFILE` is not read; its
commands are simply absent from the list. The paths are printed in the empty
state when a file is missing.
