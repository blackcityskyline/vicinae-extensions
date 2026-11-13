# Player Pilot

Control every media player `playerctl` can see: play, pause, skip, stop, and read
the current track. Fork of [dagimg-dot's
player-pilot](https://github.com/dagimg-dot/vici-extensions-official/tree/main/extensions/player-pilot),
with a side-panel view added.

## Commands

| Command | Description |
| --- | --- |
| **Player Pilot** | The player list — grid or side-panel view, per-player controls |
| **Resume Music** | Play the players named in the preference, or all of them |
| **Pause Music** | Pause them |
| **Next Track** | Skip forward |
| **Previous Track** | Skip back |

The four no-view commands run silently and close the launcher; a failure shows a
toast instead.

## Views

| View | What it shows |
| --- | --- |
| Grid | One card per player: cover art, player name, current track |
| Side panel | Players in a list on the left, the selected stream's cover art, title, artist, album and position on the right |

The launcher remembers the chosen view across runs.

## Actions

Open the panel with `ctrl+b`; every action has a shortcut.

| Action | Shortcut | Description |
| --- | --- | --- |
| Play / Pause | `ctrl+s` | Toggle the selected player |
| Next | `ctrl+shift+→` | Skip to the next track |
| Previous | `ctrl+shift+←` | Skip back |
| Stop | `ctrl+shift+s` | Stop the selected player |
| Toggle View | `ctrl+t` | Switch between the grid and the side panel |

## Preferences

| Name | Required | Description |
| --- | --- | --- |
| Players | Yes | Comma-separated player families, like `spotify,firefox`. `%any` shows every player `playerctl` reports |

A family is the part of the MPRIS name before the first dot, so `firefox` matches
`firefox.instance_1_45`. Names are not substring-matched: `spot` matches nothing.

## Requirements

`playerctl` on `PATH` and a player that speaks MPRIS. The extension reads
`playerctl --list-all` every two seconds while the view is open; a player that
disappears mid-poll is skipped, not reported.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/player-pilot/player-pilot'
```
