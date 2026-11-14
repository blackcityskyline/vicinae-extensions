# Cron Kit

Explain a cron expression in English, and manage your own crontab.

| Command | Does |
| --- | --- |
| Describe Cron | explains an expression and shows the next three runs; touches nothing |
| Crontab | lists jobs with what each means; adds, edits and removes them |

Needs the `crontab` command (on Arch, `sudo pacman -S cronie`).

## crontab is the authority

Every write goes through `crontab -`, so the system validates the schedule and
the form shows its message word for word. `cronstrue` and `cron-parser` are only
used to describe an expression: both accept lines crontab rejects, so neither is
asked whether a job may be installed. An unescaped `%` in the command is
rejected by nothing and silently truncates the command to the part before it, so
the form warns as soon as the field holds one; `\%` is the literal percent.

A `Quick` field above `Schedule` expands `5m`, `2h`, `09:30`, `weekdays 18:00`,
`weekly mon 09:30`, `monthly 1 09:30` and the `@daily` aliases into the schedule
field and nothing else; crontab still validates the result.

## Safety

`updateCrontab` reads and writes together: if `crontab -l` fails for any reason
other than "no crontab", nothing is written and the command shows the failure.
The edit applies to the crontab as it is at write time, so a job added from
another terminal survives.

The crontab is kept as lines with their exact text, not as parsed jobs, so a
comment, a variable or unfamiliar syntax is written back byte for byte and only
the edited line changes.

## Tests

`npm test` covers the pure functions. `npm run test:backend` installs a job
through `updateCrontab()`, reads it back with `crontab -l`, removes it and
asserts the file is byte-identical; it restores the crontab in a `finally` and
on Ctrl-C, and refuses to start when `crontab -l` fails for another reason. It is
not in CI because it writes to the spool the real cron reads.

## Ported from Raycast

[MIT] [niall-maloney/cron-description](https://github.com/niall-maloney/raycast-extensions)
and [tahazahit/cron-manager](https://github.com/tahazahit/cron-manager), merged
into one extension with one describer. Dropped: the timezone dropdown (crontab
runs in local time; `CRON_TZ` is too rare to imply otherwise), running a job on
demand (an arbitrary command from a keystroke), and job logs. The file is never
written directly: `crontab` handles format, locking and validation. `@midnight`,
`@annually` and `@weekly` are normalised for `cron-parser`, which does not know
them.
