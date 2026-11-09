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

The plugin ships its original nine `.frag` files unchanged. Their header
comments (`//@Title:`, `//@Tag:`, `//@Desc:`) are reused as metadata; `parseMeta`
accepts that spelling as well as `-- @name`.

Applying copies the fragment to `~/.config/hypr/animations/shader.frag` and
writes `decoration.screen_shader` as that absolute path, so the shader keeps
working if the extension is removed. Removing the shader omits the line, which
restores the default renderer on reload.

`hyprctl configerrors` cannot catch a GLSL compile failure, so every fragment is
also compiled with `glslangValidator -S frag`. The strict ES profile rejects the
header comments before `#version`, which Hyprland and the driver accept, so the
validator runs on a copy with `#version 300 es` moved to line 1. All 20
fragments pass. That check caught two real failures that `configerrors` did not
report: Lua `--` comment lines left in `tint.frag`, and `fixed` used as a
variable name, which is a reserved word in GLSL ES.

The fixed shaders were then applied to the live compositor with
`hyprctl eval 'hl.config({ decoration = { screen_shader = "..." } })'` and the
full screen (1366×768) was captured with `grim`. The run used a colour chart
(full-screen `imv`) for the generated shaders, and the desktop for the rest, so
only the rows inside each table are comparable:

| shader | mean R | mean G | mean B | luma | sd |
| --- | --- | --- | --- | --- | --- |
| no shader (desktop) | 0.101 | 0.106 | 0.112 | 0.106 | 0.115 |
| crt | 0.085 | 0.089 | 0.094 | 0.089 | 0.102 |
| chromatic | 0.101 | 0.106 | 0.112 | 0.106 | 0.106 |
| curvature | 0.094 | 0.101 | 0.108 | 0.100 | 0.105 |
| edge | 0.099 | 0.099 | 0.099 | 0.099 | 0.278 |
| grain | 0.092 | 0.096 | 0.101 | 0.096 | 0.121 |

`chromatic` barely moves a screenshot of a flat desktop: one pixel of separation
between red and blue is invisible in the mean, and only shows on high-contrast
edges. `edge` is monochrome by construction and has the highest spread, because
most of the screen is black and the contours are bright.

The three generated shaders have no fixed colours. `renderTintShader` bakes the
**Tint Color** role into `const vec3 TINT`; `renderDuotoneShader` bakes the
**Duotone Shadows** and **Duotone Highlights** roles into `SHADOW` and
`HIGHLIGHT`; `renderColorblindShader` bakes the Viénot, Brettel & Mollon 1999
projection rows for the **Color Blind Type**. All use the same
`DCH → Dux → skwd` lookup as the borders, regenerated by `src/api/palette.ts` on
apply and on every later rewrite. `primary`, `secondary`, `tertiary`, `error`
and `outline` are offered, and every source carries all five.

Tint was measured earlier on a warmer desktop, where the baseline was identical
across two consecutive frames:

| tint role | mean R | mean G | mean B | R−B |
| --- | --- | --- | --- | --- |
| none | 0.305 | 0.218 | 0.138 | +0.167 |
| primary `#a6cbe6` | 0.266 | 0.275 | 0.282 | −0.016 |
| error `#fa746f` | 0.300 | 0.240 | 0.234 | +0.066 |

`primary` pushes blue above red (cooler screen); `error` keeps red above blue
(warmer than the primary tint).

Duotone and colour-blind correction were measured over the colour chart, so the
three pure bars are visible in the pixels instead of being averaged away:

| state | red bar | green bar | blue bar |
| --- | --- | --- | --- |
| no shader | (1.00, 0, 0) | (0, 1.00, 0) | (0, 0, 1.00) |
| duotone outline → primary | (0.22, 0.26, 0.29) | (0.50, 0.60, 0.68) | (0.15, 0.16, 0.18) |
| duotone error → tertiary | (0.38, 0.27, 0.30) | (0.68, 0.65, 0.75) | (0.29, 0.17, 0.17) |
| deutan correction | (0.81, 0, 0) | (0.19, 1.00, 0) | (0, 0, 1.00) |
| protan correction | (0.92, 0, 0) | (0.08, 1.00, 0) | (0, 0, 1.00) |
| tritan correction | (1.00, 0, 0) | (0, 1.00, 0) | (0.50, 0, 1.00) |

Duotone maps every bar onto a point between the two roles, so the three bars
differ by luminance instead of hue and the whole frame takes the palette; the
two rows differ because the preferences are different roles.
The correction rows show each type working on its own axis: deutan and protan
push part of the lost red-green error back into the red channel (green gains
0.19 and 0.08 red respectively, keeping red and green apart), while tritan
leaves red and green alone and adds red to blue (blue becomes violet). The
different numbers for deutan and protan are the preference taking effect, not
noise: the chart was static, and the static shaders were pixel-identical between
frames in the same session.

### Motion

The three motion shaders (`crt-motion`, `chromatic-motion`, `grain-motion`) read
`time`. Hyprland sets that uniform to `0` unless `debug:damage_tracking` is `0`
(`src/render/OpenGL.cpp`), and `hyprctl keyword debug:damage_tracking 0` fails on
the current Lua config parser with `keyword can't work with non-legacy parsers.
Use eval.`; the measurement used
`hyprctl eval 'hl.config({ debug = { damage_tracking = 0 } })'` and restored
`2` plus a reload afterwards. `hyprctl getoption` confirmed `int: 0` and later
`int: 2`.

Two consecutive full-screen captures 0.35 s apart, with damage tracking off:

| shader | mean absolute pixel difference | pixels changed by more than 2/255 |
| --- | --- | --- |
| no shader (live desktop) | 2.29 | 4.0% |
| grain (static) | 0.000 | 0.0% |
| crt (static) | 0.002 | 0.0% |
| grain-motion | 10.72 | 80.4% |
| crt-motion | 1.75 | 36.6% |
| chromatic-motion | 0.45 | 5.5% |

The live desktop is the noise floor (a clock or cursor moves); the static
shaders are stable to the last bit. `chromatic-motion` is subtle at 0.35 s
because the shift moves between 1 and 2 pixels; over 1.2 s it changed 12.5% of
pixels against 5.6% for the same gap with no shader. `grain-motion` rewrites most
of the screen every frame, as intended.

Applying a motion shader while damage tracking is on is refused in
`applyPreset` after reading `hyprctl getoption debug:damage_tracking`; the
preference is never changed for the user. `configerrors` stayed empty through
every apply, and `hyprctl reload` restored the owner's shader and
`debug:damage_tracking = 2` each time.


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
