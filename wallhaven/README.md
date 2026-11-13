# Wallhaven

Browse and download desktop wallpapers from [Wallhaven](https://wallhaven.cc).

## Commands

| Command               | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| **Search Wallpapers** | Search wallpapers with filters for category, purity, and sorting   |
| **Top Wallpapers**    | Browse the top-rated wallpapers for a given time range             |
| **My Collections**    | Browse and set wallpapers from your personal Wallhaven collections |
| **Random Wallpaper**  | Instantly set a random wallpaper as your desktop background        |

## Actions

Open the panel with `ctrl+b`. It never closes the launcher on its own; the
launcher hides after an action that copies or sets something, as usual.

| Action                  | Shortcut       | Description                                             |
| ----------------------- | -------------- | ------------------------------------------------------- |
| Set Wallpaper           | `ctrl+shift+w` | Download and set the wallpaper on every monitor         |
| Preview Wallpaper       | `ctrl+y`       | Open a detail view with full metadata and color palette |
| Search Similar          | `ctrl+shift+s` | Find wallpapers similar to the selected one             |
| Open in Browser         | `ctrl+o`       | Open the wallpaper's page on wallhaven.cc               |
| Download                | `ctrl+d`       | Save the full-resolution image to your download folder  |
| Copy Image to Clipboard | `ctrl+shift+c` | Copy the image file directly to your clipboard          |
| Copy Image URL          | `ctrl+shift+l` | Copy the direct download URL                            |
| Copy Wallpaper ID       | `ctrl+shift+i` | Copy the wallpaper ID for sharing                       |
| Copy Color Palette      | `ctrl+shift+h` | Copy all dominant colors as hex values                  |

Two keys look odd for a reason: `ctrl+c` and `ctrl+a` belong to the search
field, which has the keyboard focus — the copy actions bound to them were never
reached and the clipboard stayed empty. Measured, not guessed.

`ctrl+o` and `ctrl+shift+c` are the launcher's generic *open* and *copy* verbs,
so a keybind remap is honoured.

## How the wallpaper is set

`Wallpaper.set` from `@vicinae/api` drives seven backends and none of them may be
the one drawing your screen, so the extension detects the one that is actually
running first. `src/backends.ts` holds the table; detection is one `ps -eo comm=`
call.

| Backend    | Seen as      | Applied with                                |
| ---------- | ------------ | ------------------------------------------- |
| Noctalia   | `noctalia`   | `noctalia msg wallpaper-set <path>`         |
| awww       | `awww-daemon`| `Wallpaper.set`                             |
| swww       | `swww`       | `Wallpaper.set`                             |
| hyprpaper  | `hyprpaper`  | `Wallpaper.set`                             |
| swaybg     | `swaybg`     | restart the daemon with the new image       |
| feh        | `feh`        | `feh --bg-fill <path>` (X11)                |
| mpvpaper   | `mpvpaper`   | `mpvpaper <path>`                           |
| waypaper   | `waypaper`   | `waypaper --wallpaper <path>`               |
| Skwd Wall  | `skwd-walld` | `wall.apply` over its Unix socket, `skwd` also recognised |

Skwd Wall has no `set` command on its command line: the daemon answers
newline-delimited JSON-RPC on `$XDG_RUNTIME_DIR/skwd-wall-v2/wall.sock` (or
`$SKWD_WALL_V2_SOCK`), and `wall.apply` is what changes the picture. The
extension writes one request and waits for the reply, with a 10-second timeout.

If detection picks the wrong program, the **Wallpaper Backend** preference names
one explicitly.

## Setup

### Basic Usage (No API Key Required)

The extension works out of the box — just open **Search Wallpapers** and start browsing SFW content.

### API Key (Optional but Recommended)

An API key unlocks:

- **NSFW content** filtering
- **My Collections** command

To get your API key:

1. Create or log in to your account at [wallhaven.cc](https://wallhaven.cc)
2. Go to [Account Settings](https://wallhaven.cc/settings/account)
3. Scroll to the **API Key** section and copy it
4. Open Vicinae's settings for this extension (`ctrl+,`) and paste it into **API Key**

### Username (Required for My Collections)

To use **My Collections**, you also need to set your username:

1. Find your username on your [Wallhaven profile](https://wallhaven.cc/settings/account)
2. In extension preferences, enter it in the **Username** field

### Download Directory (Optional)

By default, downloads are saved to `~/Downloads`, and a leading `~` in the
preference is expanded to your home directory. You can change this in extension
preferences under **Download Directory**.

## Preferences

| Name               | Required | Description                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------ |
| API Key            | No       | Enables NSFW content and collections                                     |
| Username           | No       | Required for My Collections command                                      |
| Download Directory | No       | Where to save downloaded wallpapers (default: `~/Downloads`)             |
| SFW Only           | No       | Always restrict results to SFW content, even when an API key is provided |
| Wallpaper Backend  | No       | Auto-detected by default; pick one only if detection is wrong            |

## Notes

- The Wallhaven API is rate-limited to **45 requests per minute**
- Search results are paginated at 24 wallpapers per page — scroll to the bottom to load more
- The **Random Wallpaper** command runs silently in the background (no-view mode) and shows a HUD when done
- **Search Similar** asks the API for `q=like:<id>`, which it answers with `403` for this
  client (measured: a plain search gets `200`, the same host answers `like` with a
  Cloudflare challenge). The grid opens empty with a failure toast instead of taking
  the launcher down, which is what it used to do.
- The search-bar dropdown opens with `ctrl+p`. In a **List** view Vicinae sends typed
  keys to the view's search field instead of the dropdown's filter box, so pick from
  it with the arrow keys; in a **Grid** view (this extension) typing filters it.
