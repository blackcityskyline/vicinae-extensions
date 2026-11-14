# Hyprland animations — close animation, measured per frame

Measured 2026-11-09 against the running compositor. The `hypr-animations` extension was later folded into
[`hypr/`](../../hypr/), where the animations command uses the same base layer and the same close-speed rule.

## Versions

| Thing | Value |
| ----- | ----- |
| Hyprland | `0.56.2`, commit `efb50993780079460b0cbed1363e2166a2de1d9f` |
| Config format | Lua (`hyprland.lua`), `hl.animation` / `hl.curve`; `hyprctl keyword` does not work |
| Monitor | `LVDS-1`, 1366x768, scale 1, transform 0, at `0,0` |
| Replaced plugin | Noctalia `hyprland-visual-editor` 2.0.4 (`linux-fertxo/hyprland-visual-editor`), Lua port of `XimoCP/hyprland-visual-editor` |
| Capture | `gpu-screen-recorder -w region -f 60 -fm cfr`, frames extracted with `ffmpeg -fps_mode passthrough` |

## The bug

Windows animate on open and not on close. Hyprland only changes the animation leaves a preset names; everything
else keeps its previous value. The plugin generated `~/.cache/noctalia/HVE/overlay.lua`, which began with a reset
block:

```lua
hl.animation({ leaf = "fadeOut",       enabled = false })
hl.animation({ leaf = "fadeIn",        enabled = false })
hl.animation({ leaf = "layers",        enabled = false })
hl.animation({ leaf = "layersIn",      enabled = false })
hl.animation({ leaf = "layersOut",     enabled = false })
hl.animation({ leaf = "fadeLayersIn",  enabled = false })
hl.animation({ leaf = "fadeLayersOut", enabled = false })
hl.animation({ leaf = "border",        enabled = false })
hl.animation({ leaf = "borderangle",   enabled = false })
hl.animation({ leaf = "global",        enabled = false })
```

and re-enabled only a subset per preset. `hyprctl animations` before the change:

```
name: fadeOut        enabled: 0
name: global         enabled: 0
name: windowsOut     enabled: 1
```

`windowsOut` (the geometry animation) was on, `fadeOut` (the alpha animation of the closing window) was off, so
the window left without fading. `global` off also let every unlisted leaf stay off across preset switches.

## The fix

Every applied preset is written as `assets/base.lua` followed by the preset:

1. base enables `global`, `windows*`, `fade*`, `layers*`, `fadeLayers*`, `workspaces*`, `specialWorkspace*` and
   `border`, disables `borderangle`;
2. the preset follows and overrides only the leaves it names.

The preset cannot re-disable a leaf it does not mention, and it is written second, so it wins where it has an
opinion. `~/.config/hypr/animations/active.lua` is regenerated on every apply, and `hyprland.lua` loads it with
`dofile` (Lua `require` caches modules, so a switch would not take effect). After a reload, `hyprctl animations`
shows `enabled: 1` for every leaf and `hyprctl configerrors` is empty.

## Measured close animation

Setup: an `mpv` window showing a 100x100 white PNG, forced to `[333,184]` `700x400` with
`--geometry=700x400+333+184`, captured region `600x300+350+200`, closed with
`hyprctl dispatch 'hl.dsp.window.close({window="class:mpv"})'`. The number below is the mean brightness of the
captured region per frame: ~86 with the window on it, ~41 with the wallpaper behind it.

**Before** — `fadeOut` and `windowsOut` set to `enabled = false` through `hyprctl eval`, matching the generated
overlay:

| frame | time | mean |
| ----- | ---- | ---- |
| 59 | 0.983 s | 86.3 |
| 60 | 1.000 s | 41.0 |
| 61 | 1.017 s | 41.1 |

One frame, 16 ms: the window is gone.

**After** — `hybrid` applied by this extension, `windowsIn` speed 6, `windowsOut` speed 8, `fadeOut` speed 6:

| frame | time | mean | delta |
| ----- | ---- | ---- | ----- |
| 62 | 0 ms | 85.5 | |
| 64 | 33 ms | 81.6 | -3.9 |
| 66 | 67 ms | 74.7 | -6.9 |
| 68 | 100 ms | 66.7 | -8.0 |
| 70 | 133 ms | 58.3 | -8.4 |
| 72 | 167 ms | 52.7 | -5.6 |
| 74 | 200 ms | 48.2 | -4.5 |
| 76 | 233 ms | 43.7 | -4.5 |
| 78 | 267 ms | 42.2 | -1.5 |
| 79 | 283 ms | 42.1 | -0.1 |

Seventeen frames, ~270 ms to the background, monotonic and decelerating. The animation runs for `speed * ~55 ms`
(about 440 ms at speed 8); the `popin 80%` style moves most of the alpha early, which is why the region settles
before the curve ends.

Caveat: the same method on dark terminals reports "no animation", because a dark window over a dark wallpaper
moves too few pixels to measure. The white `mpv` surface removes that ambiguity.

Every `speed` in `base.lua` and in the shipped presets was later divided by 1.15, making all built-in animations
15% faster, then rounded down to whole or half steps so the result errs fast: `hybrid` now uses `windowsIn 5`,
`windowsOut 6.5`, `fadeOut 5`. The tables above were captured before that scaling.

## Speed is duration

Measured with a linear bezier (`hl.curve("lin", { points = { {0,0}, {1,1} } })`) and `style = "slide"` on a white
window, so the region change is proportional to progress:

| `fadeOut` / `windowsOut` speed | animation length |
| ------------------------------ | ---------------- |
| 5 | ~283 ms |
| 20 | ~1100 ms |

A larger `speed` is a longer animation (roughly 55 ms per unit here), the opposite of what "speed" suggests. Every
preset set `windowsOut` one unit below `windowsIn`, which made the close *faster* than the open. The base and all
22 presets now use `windowsOut = windowsIn + 2`, and the self-check fails if any preset or the base inverts it
again.

## Compositor path, checked

With `debug:disable_logs` temporarily set to false (this build defaults it to `true`, so `hyprland.log` starts
with only startup lines and aquamarine noise), closing a window logs:

```
[Window ...: title: "whitefoot", class: whitefoot] unmapped
renderer: making a snapshot of ...
Framebuffer "window snapshot" created, status 36053
renderer: made a snapshot of ...
```

so the close path creates the snapshot and the fadeout; the missing piece was only the disabled leaves.

## Traps

- `hyprctl eval 'hl.dsp.window.float(...)'` constructs a dispatcher and does nothing. Use `hyprctl dispatch '...'`.
- `hl.animation` rejects `speed` above 100 (`value 2000 is more than the maximum of 100.00`).
- The pinned Picture-in-Picture window sits at `[4,20]` and covers most of the screen; a capture region below
  `y=400` avoids it.

## Not run

- Border, shader and workspace animations were not measured per frame; only the window close was.
  `hyprctl animations` confirmed their leaves are enabled.
- The build reports `Hyprutils: built against 0.14.2, system has 0.14.1`. Speed still scales the animation (a
  `fadeOut` of speed 100 kept the fadeout alive for over 2 s), so the mismatch is not the cause of the reported
  bug here.
