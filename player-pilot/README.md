# Player Pilot

Control every media player `playerctl` can see: play, pause, skip, stop, and read
the current track. Fork of
[dagimg-dot's player-pilot](https://github.com/dagimg-dot/vici-extensions-official/tree/main/extensions/player-pilot),
with a side-panel view added.

## Commands

| Command | Does |
| --- | --- |
| Player Pilot | the player list in a grid or a side panel, with controls |
| Resume Music / Pause Music | play or pause the players named in the preference, or all |
| Next Track / Previous Track | skip |

The `no-view` commands run silently and close the launcher; a failure is a toast.

## Views

Grid shows one card per player with cover art, name and track. Side panel lists
the players on the left and, on the right, two cards: the cover framed on a
dimmed copy of itself, whatever its shape, and under it the track, the artist and
the player's status, album and position. The view choice survives a relaunch.

The cards are SVG (`src/lib/cards.ts`): `MdImage.qml` gives a markdown image the
size in its header and caps it at 200 px, so a plain thumbnail cannot span the
pane. Keep `COVER_H` and `INFO_H` under that cap — past it the card is squashed,
not scaled. The style is `ytmusic`'s, copied rather than shared.

## Keys

`ctrl+s` play/pause, `ctrl+shift+→` next, `ctrl+shift+←` previous,
`ctrl+shift+s` stop, `ctrl+t` switch view.

## Preferences

**Players** (required) is a comma-separated list of families such as
`spotify,firefox`; `%any` shows every player. A family is the part of the MPRIS
name before the first dot, so `firefox` matches `firefox.instance_1_45`, and
`spot` matches nothing.

## Requirements

`playerctl` on `PATH` and an MPRIS player. The list is read every two seconds
while open; a player that disappears mid-poll is skipped.
