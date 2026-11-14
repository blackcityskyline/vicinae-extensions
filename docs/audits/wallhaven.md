# wallhaven

Upstream: `raycast/extensions` → `wallhaven`, author `devadathanmb`, declared
`platforms: ["macOS"]`. Deployed as upstream with the manifest rewritten (`platforms`, `author`,
scripts, one added preference) and four source files touched; nothing written from scratch.

## Preconditions

| Question | Answer | How |
| -------- | ------ | --- |
| Does wallhaven need an API key? | **No** | `GET /api/v1/search?q=nature` → 200, 73364 results, 3057 pages, no header |
| Does Vicinae know Noctalia? | **No** | `src/server/src/services/wallpaper/` has seven backends: cinnamon, gnome, hyprpaper, kde, macos, mate, swww/awww |
| Is there a `swww`/`awww`/`hyprpaper` binary here? | **No** | `command -v` finds none; `ps` shows no such child of the running `noctalia` (pid 1394) |
| What does Noctalia expose? | A CLI | `noctalia msg --help` → `wallpaper-set [connector] <path>`, `wallpaper-get [connector]`, `wallpaper-next`, `wallpaper-previous`, `wallpaper-random` |
| Does `Wallpaper.set` work here? | **No** | It needs `swww`/`awww`: `swww-wallpaper-backend.cpp` returns `"neither awww nor swww is installed"` |

Hence the detection module: `Wallpaper.set` is the correct API and is still used, but only for
backends it knows, and here it knows none of the one that is running.

## Backend detection

`src/backends.ts` is pure: a `ps -eo comm=` dump goes in, a backend comes out. Detection is
process-name based and nothing else. Sockets were considered and dropped: `swww` publishes
`$XDG_RUNTIME_DIR/swww/socket`, but a stale socket proves less than a live process and costs a
filesystem probe on every apply.

Names match **exactly**. `ps -eo comm=` prints the executable name, so `skwd-editor` must not
match `skwd-wall` and `swww-daemon` must not match `swww`.

| Backend | Detected by | Driven by |
| ------- | ----------- | --------- |
| Noctalia | `noctalia` | `noctalia msg wallpaper-set <path>` |
| awww | `awww-daemon` | `Wallpaper.set` (Vicinae's `swww` backend takes both) |
| swww | `swww` | `Wallpaper.set` |
| hyprpaper | `hyprpaper` | `Wallpaper.set` |
| swaybg | `swaybg` | `pkill -x swaybg` then detached `swaybg -i <path>` |
| feh | `feh` | `feh --bg-fill <path>` |
| mpvpaper | `mpvpaper` | `mpvpaper <path>` |
| waypaper | `waypaper` | `waypaper --wallpaper <path>` |
| Skwd Wall | `skwd-wall`, or `skwd` | **`wall.apply` over its Unix socket** |

`awww` is checked before `swww` deliberately: `swww` was archived in October 2025 and `awww` is
the same author's successor (Codeberg, `LGFae/awww`, Arch `extra` 0.12.1); both drive each other,
so preferring the live daemon over the archived one is the only difference that matters.

feh is installed here (`/usr/bin/feh`, 3.13.1-1, and `DISPLAY=:0` exists) but will never be
auto-detected: it paints the X root window and exits, so a `feh` process exists only for the
moment it takes to set the wallpaper. It is reachable through the preference. `--bg-fill` rather
than `--bg-scale` (which distorts) or `--bg-tile` (which repeats) is the equivalent of the
"Cover" the Vicinae backends get.

### Skwd Wall is not a command line

v2 is a Rust rewrite on branch `v2` (default) and a GUI client, but it publishes a JSON-RPC
socket, and `wall.apply` is on its method list, so it needs a second `Step` shape: a socket
write, not an argv. Measured from the source, because the shape is documented in neither:

| Part | Where |
| ---- | ----- |
| socket | `skwd-deck/crates/wall-proto/src/socket.rs` — `$SKWD_WALL_V2_SOCK`, else `$XDG_RUNTIME_DIR/skwd-wall-v2/wall.sock`, else `/tmp/...` |
| envelope | `wall-proto/src/envelope.rs` — `{method, params, id}`, the latter two defaulted |
| framing | `wall-proto/src/client.rs` — one JSON object per line, `\n` terminated, read with `read_line` |
| reply | same line: `{id, result}` or `{id, error: {code, message}}` |
| method | `wall-proto/src/rpc_catalog.rs` — `wall.apply`, next to `wall.list`, `wall.outputs`, `playlist.*` and about fifty more |
| params | `skwd-wall/src/infrastructure/browser/protocol.rs` `encode_apply` → `{type: "static", path}`; kinds in `wall-proto/src/renderer.rs`: `static`, `video`, `we`, `shader` |

`id` is fixed at 1. It only has to match between a request and its reply, and there is one
request per connection.

The 10-second timeout on the round trip is load-bearing: without it a daemon that accepts the
connection and never answers hangs the action forever, which reads as a frozen Vicinae rather
than a failure.

## What changed in upstream source

`setDesktopWallpaper` called `runAppleScript`, telling System Events to put a picture on every
desktop. That is macOS, and the library throws here. It is now detect-then-apply.

`fit` is `"Cover"`, not `"fill"` — `WallpaperFit` in `@vicinae/api` is
`'Cover' | 'Contain' | 'Stretch' | 'Center' | 'Tile'` and has no `"fill"`. Apple's fill was the
closest, so `Cover`.

## Filters and sorting

Left as upstream wrote it: one `Grid.Dropdown` with `storeValue`, whose items carry values like
`"sort:relevance"` and `"cat:100"`, split on the prefix in `onChange`. Four `useState` strings
behind it, and choosing a category does look like it clears the sort mode. That is how it ships;
an attempt to replace it with independent controls was reverted on request.

The platform limit is real, though: Vicinae keeps **one** search-bar accessory, so a second
`Grid.Dropdown` overwrites the first rather than appearing beside it.

```
grid-model.hpp:77    std::optional<GridSearchBarAccessory> searchBarAccessory;
model-deser.cpp:934  m.searchBarAccessory = toDropdownModel(std::move(c));   // assignment
extension-view-host.cpp:215-219   one updateDropdown(dropdown)
```

Assignment, not `push_back`. Upstream emits one dropdown, so it is unaffected; any future second
one will lose the first, silently.

Every action has an icon. Nine actions, nine icons.

| Action | Icon |
| ------ | ---- |
| Set Wallpaper | `Desktop` |
| Preview Wallpaper | `Eye` |
| Search Similar | `MagnifyingGlass` |
| Open in Browser | `Globe` |
| Download | `Download` |
| Copy Image to Clipboard | `Image` |
| Copy Image URL | `Link` |
| Copy Wallpaper ID | `Hashtag` |
| Copy Color Palette | `Swatch` |

`Open in Browser` had no icon and the three `Copy` actions shared one. `Icon.Photo` does not
exist — the enum has `Camera`, `Image` and `CopyClipboard`, and no `Photo`.

## Cut

**"Set on Current Desktop"** is gone. Every backend here sets every output: Noctalia takes an
optional connector and `swww img` has no per-monitor flag at all, so keeping the action would
have meant it quietly did the other thing. Its shortcut, `shift+cmd+W`, moved to the surviving
"Set Wallpaper" action.

**`my-collections` needs an account.** `username` and `apiKey` are both unset here, so the
command shows upstream's error. It is left as upstream wrote it because the keyless half —
search, top, random, download — is the part worth shipping.

## Verified

`npm run lint && npm run check && npm test && npm run build` all pass. 28 checks in two files.

`test/backends.test.ts`, 19 checks, the table in isolation. Confirmed able to fail by putting
each regression back:

| Regression put back | Caught by |
| ------------------ | --------- |
| `detached` dropped from the swaybg restart | the swaybg deepEqual |
| exact-name matching turned into a substring match | `skwd-editor`, `swww-daemon` |
| `"static"` → `"image"` in the payload | the `wall.apply` deepEqual |
| `SKWD_WALL_V2_SOCK` override ignored | the socket-path check |
| `feh --bg-fill` → `--bg-tile` | the feh check |
| the `\n` terminator dropped | the one-line check |

`test/skwd.test.ts`, 9 checks, the shipped `callSocket` in `src/utils.ts` against a stub that
frames the way `wall-proto/src/client.rs` does. Four daemon behaviours (accepts, replies with
`error`, replies with garbage, accepts-then-says-nothing), a missing socket, and a check that
`awww`/`swww`/`hyprpaper` reach `Wallpaper.set` and not a command line of our own.

Regressions put back there:

| Regression | Result |
| ---------- | ------ |
| the daemon's `error.message` dropped | `FAIL a daemon error is reported` |
| ENOENT replaced with the raw errno message | `FAIL a missing socket says so` |
| unparsable reply treated as success | `FAIL an unreadable reply is reported` |
| the 10s timeout removed | the suite hung — `timeout 45` exited 124 |
| `viaVicinae` bypassed | `Error: awww has no command to change the wallpaper` |

`test/accessory.test.ts` counted the dropdowns in the source and failed above one. That file,
with `filters.test.ts`, `categories.test.ts`, `selection.test.ts` and `search-query.test.ts`,
went with the revert: upstream emits one dropdown, so the limit is documented here rather than
enforced by a check.

The apply path ran against the real compositor, not simulated:

```
detected: noctalia
steps it would run: [{"argv":["noctalia","msg","wallpaper-set","/tmp/.../wp.png"]}]
```

then the command itself, with a cropped copy of the current wallpaper:

```
noctalia msg wallpaper-set .../wp.png   →  ok
noctalia msg wallpaper-get              →  /tmp/.../wp.png
settings.toml [wallpaper.monitors.LVDS-1] path updated to match
```

The original wallpaper was set back afterwards and `wallpaper-get` returned its path again.

All four commands load with no error: `Loaded extension wallhaven:search-wallpapers`,
`top-wallpapers`, `my-collections`, `random-wallpaper`, each followed by `Started extension` and
no error.

## Live check, 2026-11-13

Noctalia is gone; the **Skwd** suite (`skwd-deck-bin`, `skwd-paper-bin`, `skwd-wall-v2-bin`,
beta.29) draws the screen now. Four bugs surfaced the moment the real actions were pressed.

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| "No wallpaper backend found" on every Set | detection looked for `skwd-wall`, the machine runs `skwd-walld` (the daemon) and `skwd-wall-still` (the renderer) | the table's `process` is `skwd-walld`; `skwd`, `skwd-wall`, `skwd-wall-v2` are aliases |
| Download wrote to `/home/black/~/Downloads/` | the directory preference arrived as the literal string `~/Downloads`; Raycast expands it, Vicinae does not | `expandHome()` in `utils.ts`, and the action uses it |
| Copy Image URL and Copy Color Palette did nothing, clipboard empty | the search field has the keyboard focus and consumes `ctrl+c` (copy an empty selection) and `ctrl+a` (select all) | the four copy actions moved to `ctrl+shift+u…` — URL `l`, ID `i`, palette `h`; image uses the named `copy` verb |
| Search Similar closed the launcher | `q=like:<id>` is answered `403` + Cloudflare challenge, the rejection took the view down | caught in `SimilarWallpapers`, failure toast, empty grid |

Measured, each against the running session:

```
ps -eo comm= | grep skwd        →  skwd-walld, skwd-wall-still
socket                          →  /run/user/1000/skwd-wall-v2/wall.sock
{"method":"wall.apply","params":{"type":"static","path":"…/arch-mountains.webp"},"id":1}
                                →  {"id":1,"result":{"applied":"…/arch-mountains.webp"}}
skwd-wall-still argv after      →  /usr/bin/skwd-wall-still * …/arch-mountains.webp --fill-mode fill --persist
```

Set Wallpaper from the grid (`ctrl+shift+w`) re-pointed the renderer at
`~/.local/share/vicinae/support/wallhaven/wallhaven-1qldv1.png`; Random Wallpaper did the same on
its own. Download put a 1 537 946-byte `wallhaven-1qldv1.png` in `~/Downloads` — the same size
the API reports for that id. The four copy actions were read back with `wl-paste`: URL, id,
`#e7d8b1, #996633, #999999, #424153, #cc6633`, and a `text/uri-list` pointing at the image.

`Preview Wallpaper` (`ctrl+y`) is a grid with a single cell: the wallpaper fills the panel.
`Details` (`ctrl+shift+y`) renders the image, ID, resolution, size, type, views, favorites,
upload date and the three colours. `My Collections` without a key shows "API Key and Username
Required".

The preview is a grid and not a `Detail` because `MdImage.qml` computes the drawn height as
`Math.min(_rawH, 200, maxImageHeight)`, so no markdown image can be taller than 200 px whatever
`raycast-height` asks for. Measured with a 3840×2160 magenta PNG as the markdown image:
`?raycast-width=795&raycast-height=448` drew it 355×200 in the middle of the panel, while the
same PNG in a one-column, `Grid.Inset.Zero`, `Grid.Fit.Contain` cell fills the cell. The cell is
not full-bleed either — the launcher reserves 20 px of grid padding on each side — but the
picture is what the panel is mostly made of. Both dropdowns work: `ctrl+p` opens them, arrows
move the highlight, Enter applies — `Top Wallpapers` switched to `Last Week` and reloaded the
grid, `Search Wallpapers` switched to the `Anime` category.

Gates, through `bun` because `/usr/bin/node` was broken by a partial system upgrade
(`nodejs 26.13.1` wants `libsimdjson.so.36`, `simdjson 5.0.5` ships `.34`): `vici lint`,
`tsc --noEmit`, `bun --tsconfig-override ./tsconfig.test.json test/backends.test.ts` (20 checks)
and `test/skwd.test.ts` (10 checks), `vici build`.

`Search Similar` stays unproven beyond the `403`: whether an API key changes the answer could not
be measured, no key is configured here.

## Not verified

- **Search Similar with an API key.** The plain request is refused for this client; the keyed
  request was never sent.
- **Pagination past the first 24.** The grid loads more on scroll; nobody scrolled to the end.
- **Rate limit handling.** The 429 message exists, nothing drove the API close to 45/minute.

**That a second dropdown would have been silently dropped was not observed, only read.** The
`assignment not push_back` evidence in `grid-model.hpp` and `model-deser.cpp` is unambiguous, but
an earlier revision of this port did render four dropdowns, caught by reading the C++; the
rendered count at the time was never measured.

**The action icons were verified as data, not as pixels.** All nine are present in the installed
bundle and each of the nine actions has exactly one. That they *look* right is not established.

**The lists were not seen rendering.** Loading is not rendering. The network side was measured
independently (`GET /api/v1/search` returns the ten keys the parser reads: `category`, `colors`,
`resolution`, `thumbs`, `path`, `id`), but no one looked at the grid. `my-collections` was not
exercised at all — it needs credentials.

**No backend other than Noctalia was run live.** `awww`, `swww`, `hyprpaper`, `swaybg`, `feh`,
`mpvpaper`, `waypaper` and `skwd-wall` are in the table from their own documentation and source:
`awww-img.1.scd` on Codeberg for the `awww img` shape, `waypaper/__main__.py` for `--wallpaper`,
feh's man page for `--bg-fill`, and the swaybg restart is inferred from the fact that swaybg has
no IPC at all. hyprpaper 0.9 moved to the hyprwire object protocol, which is why it is routed
through `Wallpaper.set` and never through a socket.

**Skwd Wall's stub is not the real daemon.** `skwd-wall` is neither installed nor in the Arch
repositories, so `wall.apply` was verified against a stub built to `wall-proto/src/client.rs`'s
framing, and the parameter shape was read out of `encode_apply`. If the daemon requires a field
beyond `{type, path}`, the stub will not catch it. Its own UI sends `output`, `notify`, `mute` and
`volume` too, deliberately left out here so the daemon keeps its own defaults.

**`Wallpaper.set` was never run** — it cannot be, with neither `swww` nor `awww` installed. The
tests assert the call reaches it with `fit: "Cover"`, which is not the same as the server
honouring it. `pacman -S awww` would make the awww and swww rows testable for real.
