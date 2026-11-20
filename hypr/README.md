# Hypr

Fork of [`nino-mau`'s Hypr extension](https://github.com/vicinaehq/extensions/tree/main/extensions/hypr)
for inspecting Hyprland, plus **Animations**, **Borders** and **Shaders** from
the [Noctalia visual editor](https://github.com/XimoCP/hyprland-visual-editor)
plugin.

## Commands

- Read-only, unchanged upstream: Monitors, Workspaces, Switch Layout, Keybinds.
- **Windows** — upstream's list, plus management: close, float/tile, pin, fullscreen, center, and send to a workspace without following it. Each action dispatches to the window by address, so the launcher stays open and the row is re-read afterwards.
- **Layers** — upstream's list, plus layer rules. Hyprland exposes no dispatcher for a layer surface (no raise, hide or focus), so what can be changed at runtime is how the namespace is drawn: blur, xray, dim around, animations off, and hiding it from screen shares, each on or off, plus clearing the rules this extension made. The rule is named after the namespace and effect; it lives until a reload, and clearing it puts your own config back in force.
- **Animations** — 22 presets on a base that enables every animation leaf, so
  close animates like open. `speed` is a duration, so `windowsOut` stays above
  `windowsIn`. **No animations** writes `animations.enabled = false`.
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

## Live colours

**Live Palette**, **Follow Colors Spin**, **Sweep** and **Pulse** read the theme
instead of shipping colours: `~/.local/state/dch/palette.json`, then
`~/.cache/dms/dms-colors.json`, then `~/.cache/skwd-wall-v2/scheme.json` and
`skwd-colors.json`, each selected by its own `mode`. `primary`, `secondary`,
`tertiary` and `error` become the gradient; at least two distinct roles are
needed. Re-apply after changing the theme.

Generated shaders: **Follow Colors Tint**, **Duotone** and **Color Blind
Correction** (Viénot, Brettel & Mollon 1999) use the same lookup and are
regenerated on every rewrite.

**CRT Motion**, **Chromatic Drift** and **Film Grain Motion** read the `time`
uniform, which Hyprland forces to `0` unless `debug:damage_tracking = 0`; applying
one while damage tracking is on is refused. That setting redraws the whole screen
every frame, which is their only cost.

## Wiring

All three write `~/.config/hypr/animations/active.lua`, which `hyprland.lua`
loads with `dofile` (`require` caches, so switching presets would need a
restart). Each write updates `~/.config/hypr/.anim_state`, runs `hyprctl reload`
and reports `hyprctl configerrors`. Personal presets live in
`~/.config/hypr/animations` (`*.lua`), `borders/*.lua` and `shaders/*.frag`; a
file with a shipped preset's slug replaces it. Nothing on disk is deleted.

## Keys

| List | Keys |
| --- | --- |
| Windows | `ctrl+return` focus, `ctrl+shift+q` close, `ctrl+shift+f` float, `ctrl+shift+p` pin, `ctrl+shift+m` fullscreen, `ctrl+shift+c` center, `ctrl+shift+w` move to workspace, `cmd+d` details, `ctrl+shift+j` copy JSON |
| Layers | `ctrl+shift+r` set an effect, `ctrl+shift+x` clear this layer's rules, `cmd+d` details, `ctrl+c` copy namespace, `ctrl+shift+j` copy JSON |
| Animations | `ctrl+return` apply, `ctrl+shift+d` disable, `ctrl+r` reload, `ctrl+o` presets folder, `ctrl+shift+o` `hyprland.lua` |
| Borders | `ctrl+return` apply, `ctrl+x` remove, `ctrl+b` set border size, `ctrl+r` reload, `ctrl+o` presets folder |
| Shaders | `ctrl+return` apply, `ctrl+x` remove, `ctrl+r` reload, `ctrl+o` presets folder |
| Read-only | `ctrl+return` focus/switch, `cmd+d` details, `ctrl+shift+c` copy field, `ctrl+shift+j` copy JSON, `ctrl+o` layout doc |

## Requirements

Hyprland with a Lua config (`hl.animation`, `hl.curve`, `hl.config`) and
`hyprctl` on `PATH`.
