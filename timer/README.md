# Timer

Background timers in natural language, with presets, a repeated alarm and music while one
runs. A timer belongs to systemd, not to this window: close the launcher, the countdown
keeps going.

Fork of [HarshNarayanJha/raycast-timer](https://github.com/HarshNarayanJha/raycast-timer)
(the store build `store.vicinae.timer`), rewritten from its bundled `index.js` into `src/`
so the music could be merged in. The music, its sources and the bundled rain loops come
from [alessandrobelli/omarchy-pomodoro](https://github.com/alessandrobelli/omarchy-pomodoro)
v1.3.3, MIT. The timetable parser and the log writer come from
[yukitomo26/pomodoro-md](https://github.com/yukitomo26/pomodoro-md), MIT.
`docs/audits/timer.md` in the parent repository records what was measured and what was
dropped.

## Use

| Row | Action |
| --- | --- |
| Start timer for … | Appears as soon as the search bar holds a duration: `5m`, `1:30`, `2h`, `90s`, followed by an optional note (`5m Check laundry`). `Save as Preset` keeps exactly what was typed |
| Active Timers | Countdown, the note, the end time. `Enter` cancels. `Save as Preset` keeps a running one as `duration note` |
| Tasks, a timetable block | One row per open task and per open subtask, under its block. Starting one logs itself into the note; see below |
| Presets | The *Timer Presets* preference and the ones saved in the list, parsed with the same grammar. Every entry can be edited or removed; a preference entry is hidden in `presets.json` rather than rewritten, since a preference cannot be written from an extension |
| Stop Timer Sound | Silences a repeating alarm |
| Music, a playlist | `Add Links…` opens that playlist alone: its name and its links, one per line. Add, reorder or delete lines and save |
| Music, end of the section | `New Playlist` — a name, then its own links |

The search bar is the duration input, not a filter, so the list is deliberately parsed
rather than fuzzy-filtered. Clear it to see the presets and the music rows.

## Timetable tasks

Point **Note File** at a markdown note — or at a directory, which means the daily note
named `YYYY-MM-DD.md` — and the tasks under its timetable heading become rows that start a
timer for **Task Length** minutes. The format is the pomodoro's:

```markdown
# Timetable

## Morning (09:00~12:00) 6p
- 2p #482 : Ship the redesign
	- Review feedback
	- Write migration
```

- A block is `## Name (HH:MM~HH:MM) Np`: the time range and the pomodoro target are shown,
  not enforced. Blocks named break, lunch, dinner, breakfast or supper are skipped
  entirely.
- A task is `- Np Title`; a subtask is indented with a tab or two spaces. `[done]` after
  the count, or at the start of a subtask, hides the row.
- A markdown link in a title is read as its text: `[#482](…)` is `#482`.

Each row starts a normal timer: the same `systemd-run` unit, alarm and music. When that
timer reaches its deadline the extension appends one line to the note, under the task's
bullet in `### Pomodoro Log`; cancelling the timer writes the same line with `[ ]`:

```markdown
### Pomodoro Log

- #482 : Ship the redesign
	- [x] 09:02-09:27 Review feedback
	- [ ] 09:27-09:31 Write migration
```

The log section is created if it is missing, inside `## Work Log` when that heading
exists, otherwise at the end of the note. Nothing else in the note is rewritten, and an
entry already present is not written twice — a timer that expired while Vicinae was closed
is settled the next time the command runs. The task is not marked `[done]` for you: add it
in the note when the work is actually done.

## Shortcuts

Every action has one. Generic verbs use Vicinae's named ids (`shortcut="remove"`), so the
launcher's own `keybinds` drive them; a verb this extension invented gets a literal `ctrl+…`.
`ctrl` is written rather than `cmd`: `cmd` maps to it on Linux, but reads as a Mac binding.

| Shortcut | Action | Where |
| --- | --- | --- |
| `ctrl+s` | Start Timer, Start Preset, Start Task | the parsed duration row, a preset row, a task row |
| `ctrl+opt+p` | Save as Preset | the parsed duration row, every active timer |
| `ctrl+shift+s` | Stop Timer Sound | its own row, and every active timer |
| `ctrl+x` (`"remove"`) | Cancel Timer, Remove Preset, Remove | an active timer, a saved preset, a music playlist |
| `ctrl+shift+x` (`"remove-all"`) | Cancel All Timers | an active timer |
| `ctrl+shift+c` (`"copy"`) | Copy Timer Note | an active timer |
| `ctrl+u` | Use This Music / Play Again | a music playlist |
| `ctrl+0` | Use Silence | the Silence row |
| `ctrl+e` (`"edit"`) | Add Links…, Edit Preset | a music playlist, a saved preset |
| `ctrl+n` (`"new"`) | New Playlist | the music section and every playlist |
| `ctrl+s` (`"save"`) | Save | the playlist form and the preset form |

## Music

Silence is the default and the first row. Choosing a source only selects it; music plays
while a timer runs and is stopped by that timer's own unit when it ends, or by cancelling
the timer. Selecting a different source during a timer switches immediately.

Names are yours: the list is seeded once with the three YouTube streams, two bundled rain
loops and two generated noises, and afterwards every playlist can be renamed, removed, or
added to. Each playlist holds its own links, one per line: mpv plays them in that order and
starts the playlist over, and nothing mixes links across playlists. `Add Links…` on a row
opens only that playlist; a name is never guessed from a link. The list
lives in `~/.local/share/vicinae/support/timer/music.json`; the player's pid in `music.pid`
beside it, which is how the alarm shell knows what to stop.

Requires `mpv` (`--loop-file=inf` and `--ytdl-format`, i.e. mpv's built-in yt-dlp does the
YouTube links). The rain loops ship in `assets/`; white and brown noise are generated by
mpv's lavfi source, so they need no network. `assets/SOUNDS.md` credits the CC0 recordings.

## Preferences

| Preference | Default | Meaning |
| --- | --- | --- |
| Timer Presets | `5m Tea, 25m Pomodoro` | Comma-separated; each entry is `duration note`. Entries saved or edited from the list are added on top, once each, and live in `presets.json` in the support directory. Removing or editing one of these entries records its old text there to hide it; the preference keeps its value |
| Sound Repeat | Once | Or "Repeat until disabled", silenced by *Stop Timer Sound* |
| Music Volume | 60 | mpv volume, 0 to 100 |
| Note File | empty | The markdown note with the timetable, or a directory for a daily `YYYY-MM-DD.md`. Empty hides the tasks |
| Task Length | `25` | How long a timetable task runs, in minutes; the same grammar as the search bar, so `25m` works too |
| Timetable Heading | `# Timetable` | The heading that starts the timetable section |

## How it runs

`systemd-run --user --on-active=…s --unit=vicinae-timer-…` creates a transient user timer.
When it fires, its own shell stops the music, sends a notification and plays
`assets/alarm-submarine.wav` — so nothing depends on this window or on Vicinae being
running. Cancelling stops the unit and, when no timer is left, the music.

## Not verified

- The view was loaded and rendered, but no one has pressed the rows: starting a timer with
  music, renaming a source, and adding one through the form are covered by the unit checks
  and by the alarm script measured against real systemd, not by a human at the keyboard.
- A YouTube source was resolved with mpv in the pomodoro port on 2026-11-08; not re-run
  after the merge.
- A second timer overlapping the first: the first to end stops the music.
- The timetable rows were never on screen: this machine's *Note File* preference is empty,
  so the section is hidden, and the launcher layer cannot be captured. The note path, the
  parser, the log append and the append-twice-is-a-no-op rule were run against a real file
  (including a task title behind a markdown link), and the view loads with the section
  compiled in.
- A timer that expires while Vicinae is closed is settled on the next launch by replaying
  its stored deadline; that replay was exercised through the file writer, not by waiting
  for a real deadline.
