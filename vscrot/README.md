# VScrot+

A Vicinae extension for taking, annotating, and managing screenshots across Linux (Wayland & X11), macOS, and Windows.

---

## Commands

### `scrot` - Take a Screenshot

The main command. Opens a list of capture modes filtered to what your active tool supports. After capture, a preview lets you save, copy to clipboard, annotate, or discard.

**Capture modes:**

| Mode | Description |
|---|---|
| Capture Area | Interactive region selection |
| Capture Window | Pick a window by title from the visible workspace (arrow keys, Enter), or `Pick with Cursor` to select the box yourself. The launcher is hidden for the shot and comes back with the preview. On a compositor without window enumeration only the cursor picker is offered |
| Capture Monitor | A single display |
| Capture All Monitors | Full desktop (all displays merged) |

The **Active Tools** section at the bottom of the list shows which capture and annotation tools are currently in use. Tap either entry to switch to any other installed tool - the choice is saved and persists across sessions.

### `manage-tools` - Manage Tools

Shows all supported capture, annotation, clipboard, and dependency tools grouped by category, with installed/not-installed status. For each missing tool:

- The install command for your detected package manager is shown inline
- **Copy Install Command** copies it to the clipboard
- **Show All Package Managers** shows a full install table for every supported manager
- **Copy Install Script for All Missing Tools** generates a combined script for everything not yet installed

Supported package managers: `pacman`, `apt`, `dnf`, `brew`, `winget`

---

## Capture Backends

VScrot auto-detects the best available tool in priority order. You can override this in **Extension Preferences** or by tapping **Active Tools → Capture** inside the extension.

### Wayland

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **grimblast** | area · window · monitor · full | Hyprland-native wrapper around grim. Recommended for Hyprland. | [hyprwm/contrib](https://github.com/hyprwm/contrib) |
| **grim** + slurp | area · window · monitor · full | Compositor-agnostic Wayland grabber. Requires `slurp` for selection; window outlines come from Hyprland when present. | [grim](https://sr.ht/~emersion/grim/) · [slurp](https://github.com/emersion/slurp) |
| **spectacle** | area · window · monitor · full | KDE screenshot tool. Works on Wayland and X11. | [spectacle](https://apps.kde.org/spectacle/) |
| **gnome-screenshot** | area · window · full | GNOME screenshot utility. | [gnome-screenshot](https://gitlab.gnome.org/GNOME/gnome-screenshot) |
| **flameshot** | area · full | Cross-platform. Wayland support varies by compositor - works best on KDE/GNOME Wayland. | [flameshot.org](https://flameshot.org) |
| **Noctalia** | area · monitor · full (window on newer shells) | Noctalia shell's own screenshotter, driven over IPC with `noctalia msg screenshot-*`. Newer shells take `--directory`/`--filename-pattern`, so the capture lands exactly where the extension needs it. Older shells (5.3.0) take no options at all: the capture is copied from the newest image in the Pictures folder, and their missing `screenshot-window` command leaves window capture to the fallback order. | [noctalia](https://github.com/noctalia-dev/noctalia-shell) |

The tool chosen in **Screenshot Tool** wins while it can run here. When it is
not — missing, on the wrong display server, Noctalia stopped — the next
available ids from **Screenshot Fallback Order** are tried, and so on down the
list. Both lists accept the ids above; a tool missing from the list follows in
the built-in order, so a newly installed one is reachable without editing the
preference. An empty order keeps desktop-aware auto-detection.

### X11

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **maim** + slop | area · window · full | Recommended X11 tool. Requires `slop` for area selection and `xdotool` for window capture. | [maim](https://github.com/naelstrof/maim) · [slop](https://github.com/naelstrof/slop) |
| **scrot** | area · window · full | Classic X11 capture utility. | [scrot](https://github.com/resurrecting-open-source-projects/scrot) |

### macOS

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **screencapture** | area · window · full | Built-in macOS utility - no installation required. | - |
| **screenshot-desktop** | full · monitor | npm package bundled with the extension. Uses native OS APIs on macOS and Windows. | [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) |

### Windows

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **screenshot-desktop** | full · monitor | npm package bundled with the extension. Uses Win32 GDI - no additional install needed. | [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) |
| **flameshot** | area · full | Available for Windows via the official installer, and the only backend offering area capture there. Must be on `PATH` — the installer does not always add it. | [flameshot.org](https://flameshot.org) |

---

## Annotation Tools

After capture, the preview offers an **Annotate** action using your active annotation tool. Tools are split into two modes:

- **Auto-reload** - the tool is launched, blocks until you close it, then the preview refreshes automatically.
- **Manual save** - the tool opens in the background; save the file yourself, then use **Refresh Preview** inside the extension.

| Tool | Mode | Platform | Link |
|---|---|---|---|
| **satty** | Auto-reload | Linux (Wayland) | [gabm/Satty](https://github.com/gabm/Satty) |
| **swappy** | Auto-reload | Linux (Wayland) | [jtheoof/swappy](https://github.com/jtheoof/swappy) |
| **Noctalia** | Manual save | Linux (Wayland) | Noctalia shell's own editor, opened over IPC with `noctalia msg annotate <file>`. Saving writes a new PNG into Noctalia's screenshot folder | 
| **Gradia** | Manual save | Linux (GTK) | [Gradia](https://github.com/AlexanderVanhee/Gradia) |
| **Spectacle** | Manual save | Linux (Wayland · X11) | [spectacle](https://apps.kde.org/spectacle/) |
| **GIMP** | Manual save | Linux · macOS · Windows | [gimp.org](https://www.gimp.org) |
| **Pinta** | Manual save | Linux · macOS · Windows | [pinta-project.com](https://www.pinta-project.com) |
| **Paint** (mspaint) | Manual save | Windows (built-in) | - |
| **None** | - | All | Disables the Annotate action |

The tool chosen in **Annotation Tool** wins while it is available. When it is
not — uninstalled, Noctalia stopped, a display server it cannot drive — the next
available ids from **Annotation Fallback Order** are tried, and so on down the
list. `None` is a decision, not a fallback: it stops the chain.

Built-in order, used for anything the preference does not name:
satty → swappy → Spectacle → GIMP → Pinta → Paint → Gradia → Noctalia

---

## Clipboard Tools

Images are copied through Vicinae's own clipboard API (`Clipboard.copy`), so no
external clipboard tool is required on any platform.

---

## Dependencies

These are not capture tools themselves but are required by certain backends:

| Dependency | Required by | Link |
|---|---|---|
| **slurp** | grim (area · window · monitor modes) | [slurp](https://github.com/emersion/slurp) |
| **slop** | maim (area selection) | [slop](https://github.com/naelstrof/slop) |
| **xdotool** | maim (window capture) | [xdotool](https://github.com/jordansissel/xdotool) |
| **ImageMagick** (`identify`) | Preview metadata (image dimensions) - optional | [imagemagick.org](https://imagemagick.org) |

---

## Preferences

Preferences are the default starting point. Active tool selections made inside the extension are saved per-session via LocalStorage and override preferences.

| Preference | Description | Default |
|---|---|---|
| **Screenshot Tool** | Capture backend. `Auto-detect` picks the first available in priority order, with the desktop's own tool first. | `auto` |
| **Screenshot Fallback Order** | Comma-separated ids tried in order when the chosen backend cannot run (`grimblast`, `grim`, `spectacle`, `gnome-screenshot`, `flameshot`, `maim`, `scrot`, `screencapture`, `noctalia`, `screenshot-desktop`). A tool missing from the list follows in the built-in order. Empty keeps auto-detection. | *(empty)* |
| **Annotation Tool** | Annotation tool. `Auto-detect` starts from the fallback order. `None` disables annotation. | `auto` |
| **Annotation Fallback Order** | Comma-separated ids tried in order when the chosen annotator cannot run (`noctalia`, `satty`, `swappy`, `gradia`, `spectacle`, `gimp`, `pinta`, `mspaint`). A tool missing from the list follows in the built-in order. | `satty,swappy,spectacle,gimp,pinta,mspaint,gradia,noctalia` |
| **After Capture** | What happens after every capture command: open the annotator, show a `notify-send` notification whose **Annotate** button opens it, or leave annotation to the preview action. Notification mode saves the capture first, because the button can be clicked long after the command is gone. | `after_capture` |
| **Screenshot Path** | Base folder where screenshots are saved. | `~/Pictures/Screenshots` |
| **Subfolder Format** | `strftime`-style subfolder name (e.g. `%d-%m-%Y`). Leave blank to save directly in the base folder. | `%d-%m-%Y` |
| **Filename Format** | `strftime`-style filename (e.g. `Screenshot_%d-%m-%Y_%H-%M-%S`). | `Screenshot_%d-%m-%Y_%H-%M-%S` |
| **Copy to Clipboard** | Copy to clipboard automatically after capture. | `true` |
| **Save to File** | Save to file automatically after capture. | `true` |

**Supported date tokens:** `%Y` `%m` `%d` `%H` `%M` `%S`

---

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production bundle
npm run lint   # type-check + lint
npm run format # biome format
```
