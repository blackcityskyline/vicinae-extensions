# Audit: keybindings across the extensions

Every action should carry a shortcut, and a generic verb should use Vicinae's
named id (`shortcut="open"`) instead of a literal key, so the user's `keybinds`
drive it. `docs/authoring-extensions.md` → Keybindings has the rule and the
default table. This is what the repository looked like against it, and what was
changed.

## Method

A regex scan of every `<Action…>` element in `*/src` (`<ActionPanel` excluded),
2026-11-09. It counts actions, not panels: one action shown on five rows counts
five times. `title={<expr>}` is counted as one action even though its text
cannot be read. No row was pressed and no key was sent; this measures what the
code declares.

Modifiers are shown as the key that fires on Linux: `"cmd"` is reported as
`ctrl`.

## Before

580 actions: **123 named**, **174 literal**, **283 with no shortcut** — 49% of
the actions in this repository were reachable only by arrow-keying to them.

Seven extensions had no shortcut at all: `default-apps`, `dpaste`,
`iso-toolkit`, `markdown`, `shutdown-timer`, `url-kit`, `vim-bro`.

107 shortcuts across 17 extensions spelled the modifier `"cmd"`: `bluetooth` 16,
`wifi-commander` 23, `github` 12, `in-the-time-zone` 12, `google-translate` 8,
`downloads-manager` 5, `lucide-icons` 5, `material-icons` 5, `wallhaven` 4,
`lastfm` 4, `bible` 2, `cron-kit` 2, `shell-history` 2, `tempmail` 2, `vectis` 2,
`webapp-maker` 2, `network-info` 1. `cmd` maps to Control on Linux, so every one
of these was the key the author meant; it was style debt, not a broken key.

One launcher key was taken: `bluetooth/src/scan.tsx` bound **Pair** to `ctrl+p`,
the launcher's search filter.

## After

580 actions: **232 named**, **348 literal**, **0 with no shortcut**.

| Extension | Actions | Named | Literal | None |
| --- | --- | --- | --- | --- |
| `audio-control` | 37 | 26 | 11 | 0 |
| `bible` | 10 | 4 | 6 | 0 |
| `bitwarden` | 37 | 16 | 21 | 0 |
| `bluetooth` | 21 | 6 | 15 | 0 |
| `cron-kit` | 10 | 6 | 4 | 0 |
| `default-apps` | 3 | 1 | 2 | 0 |
| `downloads-manager` | 14 | 6 | 8 | 0 |
| `dpaste` | 1 | 1 | 0 | 0 |
| `easyeffects` | 10 | 4 | 6 | 0 |
| `github` | 43 | 19 | 24 | 0 |
| `google-translate` | 27 | 9 | 18 | 0 |
| `gpu-screen-recorder` | 2 | 1 | 1 | 0 |
| `hypr` | 43 | 39 | 4 | 0 |
| `in-the-time-zone` | 18 | 4 | 14 | 0 |
| `iskra` | 36 | 10 | 26 | 0 |
| `iso-toolkit` | 9 | 5 | 4 | 0 |
| `lastfm` | 51 | 0 | 51 | 0 |
| `lucide-icons` | 5 | 0 | 5 | 0 |
| `markdown` | 4 | 0 | 4 | 0 |
| `material-icons` | 6 | 0 | 6 | 0 |
| `miho` | 66 | 33 | 33 | 0 |
| `network-info` | 8 | 6 | 2 | 0 |
| `shell-history` | 5 | 2 | 3 | 0 |
| `shutdown-timer` | 3 | 2 | 1 | 0 |
| `tempmail` | 23 | 14 | 9 | 0 |
| `timer` | 13 | 7 | 6 | 0 |
| `url-kit` | 3 | 2 | 1 | 0 |
| `vectis` | 22 | 5 | 17 | 0 |
| `vim-bro` | 3 | 0 | 3 | 0 |
| `wallhaven` | 10 | 0 | 10 | 0 |
| `webapp-maker` | 4 | 4 | 0 | 0 |
| `wifi-commander` | 33 | 0 | 33 | 0 |

## What was changed, and how

1. Every `"cmd"` modifier became `"ctrl"`. Nothing changes at runtime on Linux.
2. A literal that fired a generic verb moved to that verb's id. `ctrl+o` on
   Open became `"open"`, `ctrl+r` on Refresh `"refresh"`, `ctrl+x` on Delete
   `"remove"`, `ctrl+shift+c` on Copy Name `"copy-name"`, and so on.
3. Every remaining action got a key. The verb decided it when the title said
   what the action is (`copy…`, `refresh…`, `remove…`, `open…`, `create…`,
   `save…`); otherwise a mnemonic from a free-key pool was assigned in source
   order, so the primary action in a panel gets the first free key.

The pools exclude the keys the launcher owns — `ctrl+b`, `ctrl+p`, `ctrl+,` —
and every id's default. The result is that 67 actions share `ctrl+a` and 37
share `ctrl+i`, never twice in one file. Assignment deduplicated per file, not
per panel, so two actions from different files shown in the same panel can still
collide. Nobody checked that case; it needs a per-panel pass, not a per-file one.

Two files that import `@raycast/api` cannot take a named id — their `Action`
prop is typed `Shortcut | null` and has no `Common` union — so `markdown` and
`vim-bro` use the object form with the key the id would resolve to.

## Not a violation

A literal key that happens to equal a generic default is only wrong when the
verb is the generic one. `easyeffects` binds Quit to `ctrl+x` and `timer` binds
Start to `ctrl+s`: same keys as `"remove"` and `"save"`, different verbs, so they
stay literal on purpose. Likewise `bluetooth`'s Disconnect on `ctrl+d` is not
`"duplicate"`, `iskra`'s Discard on `ctrl+x` is not `"remove"`, and
`in-the-time-zone`'s Reset to Now on `ctrl+n` is not `"new"`. Renaming those to a
generic id would make a remap of the generic verb do the wrong thing.

## Checks that fail for reasons unrelated to this

- `google-translate` → `npm run check`: 5 errors, all Raycast types leaking
  through a port (`Preferences`, `ExtensionPreferences`) plus two unused `React`
  imports. Fails identically before these changes.
- `iso-toolkit` → `npm test`: asserts on `xorriso`, which is not installed here.
  Fails identically before these changes.
- `gpu-screen-recorder` has no `test` script.

Every other extension passes `npm run lint`, `npm run check`, `npm test` and
`npm run build`.
