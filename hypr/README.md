# Hypr

Fork of [`nino-mau`'s Hypr extension](https://github.com/vicinaehq/extensions/tree/main/extensions/hypr)
for inspecting Hyprland, plus **Animations**, **Borders** and **Shaders** from
the [Noctalia visual editor](https://github.com/XimoCP/hyprland-visual-editor)
plugin.

## Commands

- Read-only, unchanged upstream: Monitors, Workspaces, Switch Layout, Keybinds.
- **Windows** — upstream's list plus management: close, float/tile, pin, fullscreen, centre, move to a workspace without following it. Each dispatches to the window by address, so the launcher stays open and the row is re-read after.
- **Layers** — upstream's list, plus layer rules. Hyprland exposes no dispatcher for a layer surface (no raise, hide or focus), so what can be changed at runtime is how the namespace is drawn: blur, xray, dim around, animations off, and hiding it from screen shares, each on or off, plus clearing the rules this extension made. The rule is named after the namespace and effect; it lives until a reload, and clearing it puts your own config back in force.
- **Animations** — 22 presets on a base that enables every leaf, so close
  animates like open; `speed` is a duration, so `windowsOut` stays above
  `windowsIn`. **No animations**: `animations.enabled = false`.
- **Borders** — 17 presets at `border_size = 2`, including the four live ones.
  Applying sets `general.col.active_border` and `inactive_border`; removing drops
  the block and your own config applies. **No borders** is that removal.
  **Border Size** (1–4, default 2) wins over the size inside the preset, and
  **Set Border Size** writes it with no preset at all — the colour side then
  stays yours. The size is re-read on every write and on opening the list, so a
  changed preference lands without re-applying a preset.
- **Shaders** — 21 `.frag` files. Applying copies the file to
  `~/.config/hypr/animations/shader.frag` and points `decoration.screen_shader`
  at it, so it survives removing the extension; **No shaders** removes the line.
- **Hyprimate** — the [hyprimate](https://github.com/JustinBacher/hyprimate)
  window and workspace effects. Pick one of eight window styles (liquid, paper,
  cloth, swarm, bubble, smoke, burn, construction) or four workspace styles
  (rotation, planet hop, cube, lava), toggle each animation, then tune any of
  the plugin's 309 settings live. The scope picker writes the shared value or a
  per-animation override (`window.open`, `window.close`, `window.movement`).
  Adjust numeric values with `ctrl+↑/↓`, reset one setting or the whole scope,
  and **Save to Config** writes every value you set into a marked block in
  `~/.config/hypr/plugins/hyprimate.lua` and reloads. Two commands sit at the
  top of the list: **Disable Effects** turns window and workspace effects off
  without losing the chosen styles, and **Disable Plugin (full)** unloads
  hyprimate and marks it disabled in hyprpm (the same item enables and loads it
  again). Global settings cover the external shader effects, their durations
  and the per-animation switches.

## Live colours

**Live Palette**, **Follow Colors Spin**, **Sweep** and **Pulse** read the theme
instead of shipping colours: `~/.local/state/dch/palette.json`, then
`~/.cache/dms/dms-colors.json`, then `~/.cache/skwd-wall-v2/scheme.json`/
`skwd-colors.json`, each by its own `mode`. `primary`–`error` become the
gradient; at least two distinct roles are needed. Re-apply after changing the
theme.

Generated shaders: **Follow Colors Tint**, **Duotone** and **Color Blind
Correction** (Viénot, Brettel & Mollon 1999) use the same lookup and are
regenerated on every rewrite.

**CRT Motion**, **Chromatic Drift** and **Film Grain Motion** read the `time`
uniform (Hyprland forces it to `0` unless `debug:damage_tracking = 0`); applying
one while damage tracking is on is refused. That setting redraws the whole
screen every frame — their only cost.

## Wiring

Animations, Borders and Shaders write `~/.config/hypr/animations/active.lua`,
loaded by `hyprland.lua` via `dofile` (`require` caches; switching presets needs
a restart). Each write updates `~/.config/hypr/.anim_state`, runs
`hyprctl reload` and reports `hyprctl configerrors`. Personal presets live in
`~/.config/hypr/animations` (`*.lua`, `borders/*.lua`, `shaders/*.frag`); a file
with a shipped preset's slug replaces it. Nothing on disk is deleted.

Hyprimate changes apply through `hyprctl eval 'hl.config({...})'`, because
`hyprctl keyword` does not know plugin settings on Hyprland 0.57. Save to
Config reads back everything `hyprctl getoption` reports as set, rewrites the
`-- >>> hyprimate settings` block at the end of the plugin file, and reloads.
The block stays below your own settings so it wins; remove it to fall back to
the defaults.

## Keys

| List | Keys |
| --- | --- |
| Windows | `ctrl+return` focus, `ctrl+shift+q` close, `ctrl+shift+f` float, `ctrl+shift+p` pin, `ctrl+shift+m` fullscreen, `ctrl+shift+c` center, `ctrl+shift+w` move to workspace, `cmd+d` details, `ctrl+shift+j` copy JSON |
| Layers | `ctrl+shift+r` set an effect, `ctrl+shift+x` clear this layer's rules, `cmd+d` details, `ctrl+c` copy namespace, `ctrl+shift+j` copy JSON |
| Animations | `ctrl+return` apply, `ctrl+shift+d` disable, `ctrl+r` reload, `ctrl+o` presets folder, `ctrl+shift+o` `hyprland.lua` |
| Borders | `ctrl+return` apply, `ctrl+x` remove, `ctrl+b` set border size, `ctrl+r` reload, `ctrl+o` presets folder |
| Shaders | `ctrl+return` apply, `ctrl+x` remove, `ctrl+r` reload, `ctrl+o` presets folder |
| Hyprimate | `ctrl+return` use style / set value, `ctrl+t` tune style, `ctrl+shift+x` disable effects, `ctrl+s` save to config, `ctrl+shift+c` copy Lua, `ctrl+r` reload, `ctrl+o` plugin file |
| Hyprimate settings | `ctrl+return` set or toggle, `ctrl+↑/↓` adjust, `ctrl+shift+r` reset setting, `ctrl+shift+d` reset scope, `ctrl+o` plugin file |
| Read-only | `ctrl+return` focus/switch, `cmd+d` details, `ctrl+shift+c` copy field, `ctrl+shift+j` copy JSON, `ctrl+o` layout doc |

## Requirements

Hyprland with a Lua config (`hl.animation`, `hl.curve`, `hl.config`) and
`hyprctl` on `PATH`. Hyprimate additionally needs the plugin installed with
`hyprpm add https://github.com/JustinBacher/hyprimate && hyprpm enable hyprimate &&
hyprpm reload`; the command shows these steps when the plugin is not loaded.
