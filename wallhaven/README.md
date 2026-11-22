# Wallhaven

Browse and download desktop wallpapers from [Wallhaven](https://wallhaven.cc).

## Commands

| Command | Does |
| --- | --- |
| Search Wallpapers | search with category, purity and sorting filters |
| Top Wallpapers | top-rated for a time range |
| My Collections | browse and set from your own collections |
| Random Wallpaper | set a random wallpaper, `no-view` |

## Actions

| Action | Key |
| --- | --- |
| Set Wallpaper | `ctrl+shift+w` |
| Set and Save Wallpaper | `ctrl+alt+w` |
| Preview Wallpaper | `ctrl+y` |
| Details | `ctrl+shift+y` |
| Search Similar | `ctrl+shift+s` |
| Open in Browser | `ctrl+o` |
| Download | `ctrl+d` |
| Copy Image to Clipboard | `ctrl+shift+c` |
| Copy Image URL | `ctrl+shift+l` |
| Copy Wallpaper ID | `ctrl+shift+i` |
| Copy Color Palette | `ctrl+shift+h` |

`ctrl+c` and `ctrl+a` are unused: the search field holds the focus, and those
keys never reach the actions.

## Setting the wallpaper

Nine backends are detected from `ps -eo comm=`, because `Wallpaper.set` may
drive something other than the running compositor: Noctalia (`noctalia msg
wallpaper-set`), awww, swww, hyprpaper, swaybg (restarted), feh, mpvpaper,
waypaper, and Skwd Wall over its Unix socket (`wall.apply` JSON-RPC on
`$XDG_RUNTIME_DIR/skwd-wall-v2/wall.sock`, 10-second timeout). The **Wallpaper
Backend** preference overrides detection.

## Setup

No API key is needed for SFW browsing. A key from
[wallhaven.cc/settings/account](https://wallhaven.cc/settings/account) unlocks
NSFW filtering and My Collections, which also needs your **Username**. Downloads
go to `~/Downloads` unless **Download Directory** says otherwise.

| Preference | Notes |
| --- | --- |
| API Key | optional; NSFW and collections |
| Username | required for My Collections |
| Download Directory | default `~/Downloads`; `~` expands |
| SFW Only | restrict even with a key |
| Wallpaper Backend | auto-detected |

## Notes

- API: 45 requests/minute; results 24 per page.
- Search Similar asks for `q=like:<id>`; this client gets `403` — the grid
  opens empty with a failure toast.
- Preview is a one-cell grid (Vicinae caps markdown images at 200 px): a grid
  cell draws the wallpaper full-width. Details is the `Detail` with metadata.
- In the Grid view, typing filters the search bar (which opens with `ctrl+p`).
