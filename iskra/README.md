# Iskra

Screenshots, annotation, OCR and QR reading on Linux (Wayland and X11), macOS and
Windows. Based on [vscrot](https://github.com/vicinaehq/extensions/tree/main/extensions/vscrot)
by JaINTP.

## Commands

| Command | Does |
| --- | --- |
| Screenshot | pick a capture mode, then save, copy, annotate or discard in the preview |
| Capture Pipeline | one capture, then any of Copy, Save, Annotate, OCR, QR; `ctrl+s` stores the form as the default |
| OCR | read a selected region with Tesseract; the text opens editable, `ctrl+enter` copies |
| Select OCR Language | the Tesseract language, default `eng` |
| Scan QR | decode a region with ZBar; several codes come back one per line |
| Color Picker | hyprpicker with a live magnifier; the pick returns as HEX, RGB, HSL, HSV, CMYK and a palette, with harmony rules |
| Manage Tools | installed/missing tools per category, with install commands for the detected package manager |

Capture modes are Capture Area, Capture Window (by title or a cursor pick),
Capture Monitor and All Monitors. A tool that cannot do a mode does not offer it.

## Capture backends

The chosen tool wins while it can run; otherwise the fallback order is tried.
Preference ids: `noctalia`, `grimblast`, `grim`, `gnome-screenshot`, `spectacle`,
`flameshot`, `maim`, `scrot`, `screencapture`, `screenshot-desktop`,
`hyprcapture`, `hyprcapture-pipe`; empty means desktop-aware auto-detection.

| Platform | Tools |
| --- | --- |
| Wayland | grimblast, HyprCapture (overlay or pipe), grim + slurp, spectacle, gnome-screenshot, flameshot, Noctalia |
| X11 | maim + slop, scrot |
| macOS | screencapture (built in), screenshot-desktop |
| Windows | screenshot-desktop, flameshot |

HyprCapture's overlay saves, copies and notifies by itself, so Copy, Save and
Annotate are ignored there; its pipe mode produces a normal file, so annotation,
OCR and QR work. It has no monitor mode.

## Annotation tools

`satty` and `swappy` block until closed and reload the preview; Noctalia, Gradia,
Spectacle, GIMP, Pinta and Paint are manual-save, with **Refresh Preview**.
`None` disables the action. Built-in order: Noctalia → Satty → swappy → Gradia →
Spectacle → GIMP → Pinta → Paint.

## Dependencies

| Tool | Needed by |
| --- | --- |
| slurp | grim area and window modes |
| slop, xdotool | maim area and window capture |
| tesseract | OCR |
| zbarimg | Scan QR |

Images are copied with `Clipboard.copy`; no external clipboard tool is needed.

## Preferences

| Preference | Default |
| --- | --- |
| Screenshot Tool | `auto` |
| Screenshot Fallback Order | `noctalia,grimblast,grim,gnome-screenshot,spectacle,flameshot,maim,scrot,screencapture,screenshot-desktop,hyprcapture,hyprcapture-pipe` |
| Annotation Tool | `auto` |
| Annotation Fallback Order | `noctalia,satty,swappy,gradia,spectacle,gimp,pinta,mspaint` |
| After Capture | `notify` (`annotate`, `preview` also available) |
| Capture Hand-off | `vicinae` (or `native`) |
| Screenshot Path | `~/Pictures/Screenshots` |
| Subfolder Format | `%d-%m-%Y`, blank for none |
| Filename Format | `Screenshot_%d-%m-%Y_%H-%M-%S` |
| Copy to Clipboard / Save to File | on |
| Autoclose Vicinae | off |

Date tokens: `%Y %m %d %H %M %S`. Choices made inside the extension are kept in
`LocalStorage` and override the preferences.

## Not verified

HyprCapture was measured on one machine: Hyprland 0.56.2, HyprCapture 0.4.2, one
1366x768 monitor at scale 1 and no rotation, plugin loaded manually. No second
monitor, HiDPI or rotated output; the overlay's area and window modes need a
pointer gesture and were not driven; `allow_quick`, recording, the editor and pin
modes were not touched; the pipeline form's rendering and keys were not seen.
