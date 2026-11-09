# Hypr

Fork of [`nino-mau`'s Hypr extension](https://github.com/vicinaehq/extensions/tree/main/extensions/hypr)
for inspecting Hyprland, with three visual commands added from the
[Noctalia `hyprland-visual-editor`](https://github.com/XimoCP/hyprland-visual-editor)
plugin: **Animations**, **Borders** and **Shaders**.

## Read-only commands

Monitors, Workspaces, Layers, Switch Layout, Windows and Keybinds are upstream
and unchanged apart from a `noUncheckedIndexedAccess` fix in `utils/keybinds.ts`.

## Animations

Ships 22 presets. Every preset is layered over a base that enables all animation
leaves, so window **close** animations play as reliably as opens. Hyprland's
`speed` is a duration, not a rate: a larger number is a slower animation, and the
base and every shipped preset keep `windowsOut` above `windowsIn`.

The list starts with **No animations**, which writes `animations.enabled = false`
instead of a preset file.

## Borders

Ships 17 border presets: the 13 converted static and rotating gradients, all at
`border_size = 2`, plus **Live Palette**, **Follow Colors Spin**, **Follow
Colors Sweep** and **Follow Colors Pulse**. Applying one sets
`general.col.active_border` and `inactive_border`; removing it drops the whole
block, so the next reload falls back to whatever your own config sets. A preset
that changes the shadow (`Neon Cyber-Glow`, `The Joker`) is restored the same
way. The first entry, **No borders**, is that removal.

**Live Palette** takes its four colours from the active theme instead of
shipping them. At apply time, and on every later rewrite, it reads the first of:

1. `~/.local/state/dch/palette.json` — the DCH canonical palette, whichever
   producer (Dux, skwd, Noctalia, matugen) claimed it last;
2. `~/.cache/dms/dms-colors.json` — Dux;
3. `~/.cache/skwd-wall-v2/scheme.json`, then `skwd-colors.json` — skwd.

The active half of each palette is selected by its own `mode`. `primary`,
`secondary`, `tertiary` and `error` become the gradient; at least two distinct
roles are required. Re-apply the preset after changing the wallpaper or theme.

**Follow Colors Spin** uses the same resolver and the same four roles, and lets
`borderangle` rotate the gradient around the focused window (`speed = 40`,
linear, loop). It is the moving variant, so its name and tag say so.

**Follow Colors Sweep** is the one-shot variant: same colours, `borderangle`
with `style = "once"` at `speed = 10`, so the gradient makes one quick full turn
each time a window gains focus instead of rotating forever.

**Follow Colors Pulse** rotates with a custom heartbeat curve
(`follow_pulse`), so each turn whips around and then rests instead of moving
linearly.

If no source can be read, applying any of the four live presets reports the
paths it tried; a later rewrite falls back to the colours frozen in the shipped
file.

Every border preset takes its thickness from the extension's **Border Size**
preference (1–4 px, default 2). The value is written after the preset block, so
it wins over the `border_size = 2` in the shipped files; it applies on the next
apply or reload.

The shipped colours of the other 13 are the owner's DCH palette (`primary`,
`secondary`, `tertiary`, `error`, `surface`). The original `.conf` files used
Noctalia `$palette` variables, which a Lua config cannot resolve, so those files
carry the expanded colours. If your theme differs, use a live preset, or copy
the border into your own folder and edit the colours there.

## Shaders

Ships 9 screen shaders as `.frag` files. Applying one copies it to
`~/.config/hypr/animations/shader.frag` and points
`decoration.screen_shader` at that copy, so the file survives removing the
extension. Removing the shader drops the line and the next reload restores the
default renderer. The first entry, **No shaders**, is that removal; it does not
point `screen_shader` at an identity shader, which would still cost a pass.

## Keybindings

Generic keys use the named shortcuts, so a remap in the user's `keybinds`
applies here too: `ctrl+shift+c` is `Keyboard.Shortcut.Common.Copy`, `ctrl+r` is
`Refresh`, `ctrl+o` is `Open`, `ctrl+x` is `Remove`.

Animations:

| Key | Action |
| --- | --- |
| `ctrl+return` | Apply preset |
| `ctrl+shift+d` | Disable animations |
| `ctrl+r` | Reload Hyprland |
| `ctrl+o` | Open presets folder |
| `ctrl+shift+o` | Open `hyprland.lua` |

Borders and Shaders:

| Key | Action |
| --- | --- |
| `ctrl+return` | Apply preset |
| `ctrl+x` | Remove border / shader |
| `ctrl+r` | Reload Hyprland |
| `ctrl+o` | Open your presets folder |

Read-only commands:

| Key | Action |
| --- | --- |
| `ctrl+return` | Focus monitor, window or workspace; switch layout |
| `ctrl+d` | Show or hide details |
| `ctrl+shift+c` | Copy the primary field |
| `ctrl+shift+d` | Copy description (Monitors), dispatch (Keybinds) |
| `ctrl+shift+e` | Copy dispatcher (Keybinds) |
| `ctrl+shift+g` | Copy argument (Keybinds) |
| `ctrl+shift+r` | Copy resolution (Monitors) |
| `ctrl+shift+m` | Copy monitor (Layers, Workspaces) |
| `ctrl+shift+a` | Copy address (Layers, Windows) |
| `ctrl+shift+i` | Copy PID (Layers, Windows), workspace ID (Workspaces) |
| `ctrl+shift+k` | Copy class (Windows) |
| `ctrl+shift+j` | Copy JSON (all lists) |
| `ctrl+o` | Open the layout doc (Switch Layout) |

## Your presets

Personal files live under `~/.config/hypr/animations`:

- animations: `*.lua` directly in that folder (except `active.lua`);
- borders: `borders/*.lua`;
- shaders: `shaders/*.frag`.

A personal file with the same slug as a shipped preset replaces it, so copying
a shipped preset into your folder is how you fork it. Nothing on disk is
modified or deleted.

## How it is wired

All three commands write the same generated file,
`~/.config/hypr/animations/active.lua`, and `hyprland.lua` loads it:

```lua
-- >>> Hyprland Animations <<<
pcall(function()
	dofile(os.getenv("HOME") .. "/.config/hypr/animations/active.lua")
end)
-- <<< Hyprland Animations <<<
```

`dofile` is deliberate: `require` caches modules, so switching presets would do
nothing until Hyprland restarted. The file holds the animation base, the chosen
animation, the border block and the shader line. Each write also updates
`~/.config/hypr/.anim_state`, runs `hyprctl reload`, and fails loudly if
`hyprctl configerrors` reports anything.

The animations list shows a setup row with a link to `hyprland.lua` when the
loader is missing.

## Requirements

- Hyprland with a Lua config (`hl.animation`, `hl.curve`, `hl.config`).
- `hyprctl` on `PATH`, pointed at the running instance.

## Development

```bash
npm install
npm run lint    # manifest
npm run check   # tsc --noEmit
npm test        # preset metadata, close-speed and composition invariants
npm run build   # type-check, bundle, install
```

Open a command with:

```bash
vicinae 'vicinae://launch/@black/hypr/animations'
vicinae 'vicinae://launch/@black/hypr/borders'
vicinae 'vicinae://launch/@black/hypr/shaders'
```
