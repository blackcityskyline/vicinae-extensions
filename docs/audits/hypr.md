# hypr (fork with animations, borders and shaders)

Fork of `vicinaehq/extensions/hypr` (`nino-mau`), with three visual commands
lifted from the Noctalia `hyprland-visual-editor` plugin that used to run this
desktop. Measured Nov 9 2026 against Hyprland 0.56.2 with a Lua config.

## Source and diff from upstream

Upstream files were taken from
`https://github.com/vicinaehq/extensions/tree/main/extensions/hypr` (the
installed extension in `~/.local/share/vicinae/extensions/store.vicinae.hypr` is
the bundled build, not source). All six upstream commands are kept as-is.

One compile fix: `src/utils/keybinds.ts` indexed the `KEY_*` header regex
groups under `noUncheckedIndexedAccess`, where they are `string | undefined`.
The assignment is now guarded; behaviour is unchanged.

Added: `src/animations.tsx`, `src/borders.tsx`, `src/shaders.tsx`,
`src/components/preset-list.tsx`, `src/api/presets.ts`, `src/api/palette.ts`,
`src/utils/preset.ts`, `src/utils/palette.ts`,
`assets/{base.lua,presets,borders,shaders}`, `test/preset.test.ts`.

## One generated file

All three commands rewrite `~/.config/hypr/animations/active.lua` and
`~/.config/hypr/.anim_state`, then `hyprctl reload` and refuse a non-empty
`hyprctl configerrors`. The file is `base + animation + border + shader`, so
changing one layer re-emits the other two; Hyprland reloads the whole config, so
a block that is not written is not merely stale, it is gone. That is what makes
"Remove Border" work: the next reload falls back to `config/appearance.lua`.

`hyprland.lua` loads the file with `dofile` inside `pcall` (see the previous
`docs/audits/hypr-animations.md` for why not `require`).

## Borders

The plugin's 13 `.conf` files were converted to `assets/borders/*.lua`:

- `general.col.active_border` becomes
  `{ colors = { ... }, angle = N }`. Verified live: setting that table and
  reading `hyprctl getoption general:col.active_border` returns
  `gradient data: ffcba6f7 ff1e1e2e 90deg`.
- `$primary`, `$secondary`, `$tertiary`, `$error`, `$surface`,
  `$surface_lowest` are Noctalia config variables. `hl.config` takes values, not
  config-language variables, so they are expanded in the shipped files with the
  owner's live DCH palette (`dch/dch-colors-extended.lua`):
  `primary #a6cbe6`, `secondary #b6c9d8`, `tertiary #dadeff`,
  `error #fa746f`, `surface #0b0f11`, `surface_lowest #000000`.
- The owner's `general.border_size` is `0`, so every border preset sets
  `border_size = 2`; otherwise a preset would apply and change nothing.
- `animation = borderangle, 0` in the conf becomes
  `hl.animation({ leaf = "borderangle", enabled = false })`; the rotating
  presets keep their bezier, speed and `loop` style.
- `Neon Cyber-Glow` and `The Joker` also set a shadow; the shadow block lives in
  the preset, so removing the border restores `config/appearance.lua`'s shadow.

Validation: all 13 composed files were applied with
`hyprctl eval 'dofile("/tmp/opencode/border-<slug>.lua")'` and each left
`hyprctl configerrors` empty.

### Live borders: Live Palette, Follow Colors Spin, Sweep and Pulse

The plugin's Noctalia integration was a colour *source*, not a preset:
`assets/scripts/color_sources.d/noctalia_palette.sh` read the active palette
when a border was applied. A static file cannot follow the next wallpaper, so
`assets/borders/live.lua`, `follow-colors.lua`, `follow-colors-sweep.lua` and
`follow-colors-pulse.lua` are only metadata plus frozen fallback colours.
`src/api/palette.ts` resolves the palette on apply and on every later rewrite,
which is the same moment Hyprland reloads anyway; there is no watcher, timer or
extra process.

Sources, in order, each selected by its own `mode`:

| Source | File | Shape |
| --- | --- | --- |
| DCH | `$XDG_STATE_HOME/dch/palette.json` | `roles.<role>.dark\|light` |
| Dux | `$XDG_CACHE_HOME/dms/dms-colors.json` | `colors.<mode>.<role>` |
| skwd | `$XDG_CACHE_HOME/skwd-wall-v2/scheme.json` | `colors.<role>.<mode>.color` |
| skwd | `$XDG_CACHE_HOME/skwd-wall-v2/skwd-colors.json` | flat, no mode: read as dark |

Measured on this desktop, Nov 9 2026: DCH `mode=dark`, 50 roles, source
`dux/dms-matugen`; Dux `mode=dark`; skwd `mode=dark` with `is_dark_mode: true`;
the flat skwd file has nine keys and no mode. DCH is read first because it
already records whichever producer claimed the wallpaper last, so the fallbacks
only matter when the hub is not running.

`primary`, `secondary`, `tertiary` and `error` become the gradient at `angle =
45`; at least two distinct roles are required or the source is skipped.
`surface` is excluded: in light mode it is the window background, and a border
drawn in it disappears. **Live Palette** stops `borderangle`; **Follow Colors
Spin** uses the same colours and enables it at `speed = 40`, `bezier =
"linear"`, `style = "loop"`, so the gradient rotates around the window; **Follow
Colors Sweep** uses `speed = 10`, `style = "once"`, so it turns once and stops;
**Follow Colors Pulse** adds `hl.curve("follow_pulse", { type = "bezier", points
= { { 0.05, 0.9 }, { 0.1, 1 } } })` and loops at `speed = 40` with that bezier,
so each turn whips around and rests. `alternate` is not a borderangle style in
this build: it fails with `hl.animation("borderangle"): unknown style`.

Validation: all four generated sources were evaluated with
`hyprctl eval 'dofile(...)'`; `configerrors` stayed empty.
`hyprctl getoption general:col.active_border` returned
`gradient data: ffa6cbe6 ffb6c9d8 ffdadeff fffa746f 45deg`, matching the DCH
dark palette. For the moving files, `hyprctl animations` reported
`borderangle: overridden 1, enabled 1` with `bezier linear, speed 40, style
loop` for Spin, `bezier linear, speed 10, style once` for Sweep and `bezier
follow_pulse, speed 40, style loop` for Pulse. Hyprland re-runs the 0→1
progress in `CWindow::onFocusAnimUpdate`, which is what makes `style = "once"`
a sweep on focus rather than a single turn on reload. `hyprctl reload`
restored the previous config after each.

The **Border Size** preference is applied as a second
`hl.config({ general = { border_size = N } })` after the preset block, so it
overrides the size written in every shipped file without editing 17 of them.
Measured with `duo.lua` plus an override of `4`: `configerrors` stayed empty
and `hyprctl getoption general:border_size` returned `int: 4`, while the reload
restored the owner's `int: 0`.

## Shaders

The plugin's 9 `.frag` files are shipped unchanged. Their header comments
(`//@Title:`, `//@Tag:`, `//@Desc:`) are reused as metadata; `parseMeta` accepts
that spelling as well as `-- @name`.

Applying copies the fragment to `~/.config/hypr/animations/shader.frag` and
writes `decoration.screen_shader` as that absolute path, so the shader keeps
working if the extension is removed. Removing the shader omits the line, which
restores the default renderer on reload.

`hyprctl configerrors` cannot catch a GLSL compile failure, so each fragment was
applied to the live compositor and a 500×250 screen region was captured with
`grim`. All nine produced distinct output that matches its name:

| shader | mean | mean R | mean G | mean B |
| --- | --- | --- | --- | --- |
| no shader | 0.177 | 0.173 | 0.188 | 0.171 |
| night | 0.136 | 0.185 | 0.141 | 0.083 |
| mono | 0.227 | 0.227 | 0.227 | 0.227 |
| vibrant | 0.459 | 0.484 | 0.458 | 0.434 |
| invert | 0.776 | 0.783 | 0.767 | 0.778 |
| oled | 0.176 | 0.179 | 0.183 | 0.167 |

## Traps met

- `hyprctl keyword` fails on a Lua config; config goes through
  `hyprctl eval '<lua>'`. `hl.dsp.*` evaluated there only constructs a
  dispatcher and does nothing.
- `hyprctl getoption decoration:shadow:color` reports a gradient in this build;
  `rgba(ffffff44)` is accepted.
- `screen_shader = ""` clears the shader.
- This `grim` build parses `-g` as `x,y wxh`, not `WxH+X+Y`; the latter is
  rejected with `invalid geometry`.
- Shaders are global: a black-screen or broken fragment is not caught by
  config validation, only by looking at the screen.
