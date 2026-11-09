# Audit: keybindings across the extensions

Every action should carry a shortcut, and a generic verb should use Vicinae's
named id (`shortcut="open"`) instead of a literal key, so the user's `keybinds`
drive it. `docs/authoring-extensions.md` → Keybindings has the rule and the
default table. This is what the repository looks like against it.

## Method

A regex scan of every `<Action…>` element in `*/src` (`<ActionPanel` excluded),
2026-11-09. It counts actions, not panels: one action shown on five rows counts
five times. `title={<expr>}` is counted as one action even though its text
cannot be read. No row was pressed and no key was sent; this measures what the
code declares.

Modifiers are shown as the key that fires on Linux: `"cmd"` is reported as
`ctrl`. The 107 shortcuts that literally say `"cmd"` are counted separately
below.

## Totals

580 actions: **123 named**, **174 literal**, **283 with no shortcut** — 49% of
the actions in this repository are reachable only by arrow-keying to them.

| Extension | Actions | Named | Literal | None |
| --- | --- | --- | --- | --- |
| `audio-control` | 37 | 20 | 7 | 10 |
| `bible` | 10 | 4 | 1 | 5 |
| `bitwarden` | 37 | 2 | 16 | 19 |
| `bluetooth` | 21 | 0 | 19 | 2 |
| `cron-kit` | 10 | 0 | 2 | 8 |
| `default-apps` | 3 | 0 | 0 | 3 |
| `downloads-manager` | 14 | 6 | 5 | 3 |
| `dpaste` | 1 | 0 | 0 | 1 |
| `easyeffects` | 10 | 4 | 6 | 0 |
| `github` | 43 | 1 | 12 | 30 |
| `google-translate` | 27 | 9 | 11 | 7 |
| `gpu-screen-recorder` | 2 | 1 | 0 | 1 |
| `hypr` | 43 | 39 | 4 | 0 |
| `in-the-time-zone` | 18 | 0 | 16 | 2 |
| `iskra` | 36 | 2 | 16 | 18 |
| `iso-toolkit` | 9 | 0 | 0 | 9 |
| `lastfm` | 51 | 0 | 4 | 47 |
| `lucide-icons` | 5 | 0 | 4 | 1 |
| `markdown` | 4 | 0 | 0 | 4 |
| `material-icons` | 6 | 0 | 4 | 2 |
| `miho` | 66 | 17 | 1 | 48 |
| `network-info` | 8 | 5 | 0 | 3 |
| `shell-history` | 5 | 0 | 4 | 1 |
| `shutdown-timer` | 3 | 0 | 0 | 3 |
| `tempmail` | 23 | 5 | 2 | 16 |
| `timer` | 13 | 7 | 6 | 0 |
| `url-kit` | 3 | 0 | 0 | 3 |
| `vectis` | 22 | 1 | 2 | 19 |
| `vim-bro` | 3 | 0 | 0 | 3 |
| `wallhaven` | 10 | 0 | 7 | 3 |
| `webapp-maker` | 4 | 0 | 2 | 2 |
| `wifi-commander` | 33 | 0 | 23 | 10 |

Three extensions meet the rule completely: `hypr` (39 of 43 named, 4 of its own
verbs literal), `timer` and `easyeffects` (0 without a shortcut).

## Seven extensions have no shortcut at all

`default-apps` (3), `dpaste` (1), `iso-toolkit` (9), `markdown` (4),
`shutdown-timer` (3), `url-kit` (3), `vim-bro` (3). These are small, written
here, and the cheapest to finish: 26 actions in total.

## Generic verbs still bound to a literal key

Each of these would start following `keybinds` by changing one prop to the id in
brackets and dropping the literal.

| Where | Key | Action | Id |
| --- | --- | --- | --- |
| `audio-control/src/components/PresetList.tsx:146` | `ctrl+x` | Delete Preset | `"remove"` |
| `audio-control/src/components/BluetoothDeviceItem.tsx:77` | `ctrl+r` | Refresh | `"refresh"` |
| `audio-control/src/components/StreamItem.tsx:73` | `ctrl+shift+c` | Copy Stream Name | `"copy-name"` |
| `audio-control/src/components/AudioDeviceItem.tsx:229` | `ctrl+shift+c` | Copy Device Name | `"copy-name"` |
| `bluetooth/src/scan.tsx:212`, `:258` | `ctrl+r` | Rescan | `"refresh"` |
| `bluetooth/src/devices.tsx:381`, `:475` | `ctrl+r` | Refresh (Devices) | `"refresh"` |
| `cron-kit/src/crontab.tsx:120` | `ctrl+e` | Edit Crontab by Hand | `"edit"` |
| `cron-kit/src/crontab.tsx:155` | `ctrl+backspace` | Remove Job | `"remove"` |
| `downloads-manager/src/manage-downloads.tsx:236` | `ctrl+o` | Open File | `"open"` |
| `google-translate/src/translate-form.tsx:92` | `ctrl+r` | Refresh Translation | `"refresh"` |
| `in-the-time-zone/src/in-the-time-zone.tsx:195` | `ctrl+e` | Edit Cities | `"edit"` |
| `in-the-time-zone/src/in-the-time-zone.tsx:209`, `:261` | `ctrl+c` | Copy Base Time | `"copy"` |
| `in-the-time-zone/src/in-the-time-zone.tsx:289` | `ctrl+backspace` | Remove City | `"remove"` |
| `iskra/src/window.tsx:54`, `CapturePreview.tsx:78`, `CaptureList.tsx:59` | `ctrl+r` | Refresh | `"refresh"` |
| `iskra/src/components/CaptureList.tsx:196` | `ctrl+x` | Delete | `"remove"` |
| `iskra/src/components/CaptureList.tsx:184` | `ctrl+c` | Copy to Clipboard | `"copy"` |
| `lucide-icons/src/search.tsx:117` | `ctrl+o` | Open in Browser | `"open"` |
| `lucide-icons/src/search.tsx:89` | `ctrl+c` | Copy Name | `"copy-name"` |
| `material-icons/src/actions.tsx:11` | `ctrl+c` | Copy Name | `"copy-name"` |
| `shell-history/src/history.tsx:185` | `ctrl+r` | Reload | `"refresh"` |
| `tempmail/src/message.tsx:157` | `ctrl+backspace` | Delete Message | `"remove"` |
| `wallhaven/src/components/WallpaperActions.tsx:123` | `ctrl+o` | Open in Browser | `"open"` |
| `wallhaven/src/components/WallpaperActions.tsx:145` | `ctrl+c` | Copy Image URL | `"copy"` |
| `webapp-maker/src/manage.tsx:61`, `:69` | `ctrl+e`, `ctrl+x` | Edit, Remove | `"edit"`, `"remove"` |
| `wifi-commander/src/{iwctl,nmcli}/*.tsx` | `ctrl+r` ×4 | Refresh | `"refresh"` |
| `wifi-commander/src/{iwctl,nmcli}/*.tsx` | `ctrl+c` / `ctrl+shift+c` | Copy SSID / BSSID / name | `"copy"` |

## A launcher key is taken

`bluetooth/src/scan.tsx:247` binds **Pair** to `ctrl+p`, which the launcher uses
for its search filter. The only collision of this kind found: no extension binds
`ctrl+b` (action panel) or `ctrl+,` (settings).

## Not a violation

A literal key that happens to equal a generic default is only wrong when the verb
is the generic one. `easyeffects` binds Quit to `ctrl+x` and `timer` binds Start
to `ctrl+s`: same keys as `"remove"` and `"save"`, different verbs, so they stay
literal on purpose. Likewise `bluetooth`'s Disconnect on `ctrl+d` is not
`"duplicate"`, `iskra`'s Discard on `ctrl+x` is not `"remove"`, and
`in-the-time-zone`'s Reset to Now on `cmd+n` (that is `ctrl+n` on Linux) is not
`"new"`. Renaming those to a generic id would make a remap of the generic verb do
the wrong thing.

## `cmd` where the rule says `ctrl`

107 shortcuts across 17 extensions spell the modifier `"cmd"`: `bluetooth` 16,
`wifi-commander` 23, `github` 12, `in-the-time-zone` 12, `google-translate` 8,
`downloads-manager` 5, `lucide-icons` 5, `material-icons` 5, `wallhaven` 4,
`lastfm` 4, `bible` 2, `cron-kit` 2, `shell-history` 2, `tempmail` 2, `vectis` 2,
`webapp-maker` 2, `network-info` 1.

`cmd` maps to Control on Linux, so every one of these is the key the author meant;
the count is a style debt against the rule, not a broken key. It is also the
cheapest class to clear: a textual `"cmd"` → `"ctrl"` changes nothing at runtime
and needs no redesign. It was not touched in this audit.

## Ports

`bitwarden`, `github`, `lastfm`, `vectis`, `tempmail`, `iskra` and
`wifi-commander` are upstream Raycast or store extensions. Their panels are
upstream's; changing them is a fork-wide edit, not a local one. The rule in this
repository is that a port keeps upstream's keys until a file is touched for
another reason, and then moves that file's generic verbs to ids. The literal
rows above are the list to work from when that happens.
