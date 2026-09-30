# Cron Kit

Two commands: explain a cron expression in English, and manage your own
crontab.

| Command | What it does |
| --- | --- |
| Describe Cron | Explains an expression and shows the next three runs. Touches nothing. |
| Crontab | Lists your jobs with what each one means. Adds, edits and removes them. |

Needs the `crontab` command — on Arch, `sudo pacman -S cronie`.

## crontab is the authority, not a parser

Every write goes through `crontab -`, and crontab validates the schedule itself:

```
$ printf 'not a schedule * * * * echo hi\n' | crontab -
"-":1: bad minute
Invalid crontab file, can't install.
```

That message is what the form shows, word for word. The libraries
(`cronstrue`, `cron-parser`) only decide what is worth *describing*; they are
never asked whether something may be installed. They disagree with crontab in
both directions — `cronstrue` accepts `@every_minute`, which crontab rejects,
and `cron-parser` accepts `* * * *`, which crontab also rejects — so trusting
either one to validate would have installed a broken job.

## Nothing is written unless the crontab was read first

`updateCrontab` in `src/api/crontab.ts` does the read and the write together.
If `crontab -l` fails for any reason other than "you have no crontab", the write
does not happen at all, and the command shows the failure instead of a list.

This is the failure that would matter: reading an empty string and writing it
back replaces every job you have with none. Having no crontab is a normal state
and is read as an empty crontab; anything else is an error.

The edit is also applied to the crontab as it is at the moment of writing, not to
the snapshot the list was rendered from, so a job added from another terminal
while the form was open survives.

## Comments and variables are never rewritten

The crontab is held as a list of lines, each keeping the exact text it came
from, not as a list of parsed jobs:

```
# my crontab, keep the comment
SHELL=/bin/bash
*/5 * * * * /usr/bin/true --probe
```

A line this code does not understand — a comment, `MAILTO=""`, a dialect's
syntax it has never heard of — is written back byte for byte. A line it gets
*wrong* is then at worst left alone, which is the difference between a cosmetic
bug and a lost job. Only the line you edited is rewritten.

## Ported from Raycast

Upstream, both MIT:

- [niall-maloney/cron-description](https://github.com/niall-maloney/raycast-extensions)
  — the Describe Cron command
- [tahazahit/cron-manager](https://github.com/tahazahit/cron-manager) — the
  Crontab command

### What changed

**The two extensions are one.** Both need a cron expression described in
English, and that is now one function used by both.

**No timezone dropdown.** Upstream offers every IANA zone, because crontab has
no timezone concept in the expression: a job runs in the local time of the
machine, full stop. `CRON_TZ=` exists but is rare enough that a dropdown
implying jobs run somewhere else would be worse than useless. Next runs are
shown in local time.

**The crontab command gained writing.** Upstream reads and writes crontab files
itself. This shells out to `crontab` for both, so the on-disk format, the
locking and the validation are the system's problem rather than a reimplementation.

**Validation is crontab's, so there is no dry run.** Upstream previews a job
before saving it. Here the save *is* the validation: the form stays open and
shows whatever crontab objected to.

### Dropped

- Running a job on demand. That executes an arbitrary command from a launcher
  keystroke, which is more than a cron editor should do quietly.
- Job logs (`tahazahit` reads them back from `journalctl`); this extension does
  not track which output belongs to which job.
- The `@midnight`, `@annually` and `@weekly` aliases are new, not dropped:
  `cron-parser` does not know them and crontab accepts all three, so they are
  normalised before the parser sees them.
