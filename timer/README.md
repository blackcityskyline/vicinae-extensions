# Timer

Background timers in natural language, with presets, a repeated alarm and music
while one runs. A timer belongs to systemd, not to this window: closing the
launcher does not stop it.

Fork of [HarshNarayanJha/raycast-timer](https://github.com/HarshNarayanJha/raycast-timer),
rewritten from its bundle so the music from
[alessandrobelli/omarchy-pomodoro](https://github.com/alessandrobelli/omarchy-pomodoro)
could be merged in; the timetable parser and log writer are from
[yukitomo26/pomodoro-md](https://github.com/yukitomo26/pomodoro-md), all MIT.

## Use

The search bar is the duration input, not a filter: `5m`, `1:30`, `2h`, `90s`,
optionally followed by a note (`5m Check laundry`). Rows:

- **Start timer for …** — appears as soon as the bar holds a duration.
- **Active Timers** — countdown, note and end time; Enter cancels.
- **Presets** — the `Timer Presets` preference plus the ones saved from the list;
  edit or remove any entry.
- **Tasks** — one row per open task in the timetable note.
- **Music** — Silence, playlists, Add Links…, New Playlist.
- **Stop Timer Sound** — silences a repeating alarm.

## Timetable tasks

Point **Note File** at a markdown note, or at a directory for a daily
`YYYY-MM-DD.md`, and the tasks under its timetable heading start a timer for
**Task Length** minutes:

```markdown
# Timetable

## Morning (09:00~12:00) 6p
- 2p #482 : Ship the redesign
	- Review feedback
```

`## Name (HH:MM~HH:MM) Np` marks a block (breaks, lunch, dinner, breakfast and
supper are skipped); `- Np Title` is a task, indented children are subtasks, and
`[done]` hides a row. When a task timer ends, one line is appended under the
task in `### Pomodoro Log`; cancelling writes the same line as `[ ]`. The section
is created if missing, nothing else in the note is rewritten, and a line already
there is not added twice. `[done]` is not set for you.

## Shortcuts

`ctrl+s` start, `ctrl+opt+p` save as preset, `ctrl+x` cancel/remove, `ctrl+r`
refresh, `ctrl+shift+x` cancel all, `ctrl+shift+c` copy the note, `ctrl+u` use
this music, `ctrl+0` silence, `ctrl+e` edit, `ctrl+n` new playlist, `ctrl+shift+s`
stop the alarm.

## Music

Silence is the default. A source is selected, not started: music plays while a
timer runs and that timer's unit stops it at the end; switching mid-timer
switches at once. The list is seeded with three YouTube streams, two bundled
CC0 rain loops and two generated noises, then each playlist holds its own links,
played in order by `mpv` (`--loop-file=inf`, its yt-dlp hook). State is
`~/.local/share/vicinae/support/timer/music.json`, the player's pid beside it.

## Preferences

| Preference | Default |
| --- | --- |
| Timer Presets | `5m Tea, 25m Pomodoro` |
| Sound Repeat | Once (or until disabled) |
| Music Volume | 60 |
| Note File | empty (tasks hidden) |
| Task Length | `25` |
| Timetable Heading | `# Timetable` |

## How it runs

`systemd-run --user --on-active=… --unit=vicinae-timer-…` creates a transient
timer whose shell stops the music, notifies and plays the bundled alarm, so
nothing depends on the launcher or on Vicinae staying open. Cancelling stops the
unit and, when no timer is left, the music.

## Not verified

No row was pressed in the launcher: starting a timer with music, renaming a
source and the playlist form are covered by unit checks and by the alarm script
against real systemd. The timetable rows were never on screen (no Note File);
their parser, log append and the append-twice rule were run against a real file.
A timer expiring while Vicinae is closed was exercised through the file writer,
not by waiting.
