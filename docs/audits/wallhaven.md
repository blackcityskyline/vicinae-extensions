# wallhaven

Upstream: `raycast/extensions` → `wallhaven`, author `devadathanmb`, declared `platforms: ["macOS"]`.

Deployed as upstream, with the manifest rewritten (`platforms`, `author`, scripts, one
added preference) and four source files touched. Nothing was written from scratch.

## What was measured before writing anything

| Question | Answer | How |
| -------- | ------ | --- |
| Does wallhaven need an API key? | **No** | `GET /api/v1/search?q=nature` → 200, 73364 results, 3057 pages, no header |
| Does Vicinae know Noctalia? | **No** | `src/server/src/services/wallpaper/` has seven backends: cinnamon, gnome, hyprpaper, kde, macos, mate, swww/awww |
| Is there a `swww`/`awww`/`hyprpaper` binary here? | **No** | `command -v` finds none; `ps` shows no such child of the running `noctalia` (pid 1394) |
| What does Noctalia expose? | A CLI | `noctalia msg --help` → `wallpaper-set [connector] <path>`, `wallpaper-get [connector]`, `wallpaper-next`, `wallpaper-previous`, `wallpaper-random` |
| Does `Wallpaper.set` work here? | **No** | It needs `swww`/`awww`: `swww-wallpaper-backend.cpp` returns `"neither awww nor swww is installed"` |

That is the whole reason this extension has a detection module. `Wallpaper.set` is the
correct API and it is still used — but only for backends it knows, and on this machine it
knows none of the one that is running.

## Backend detection

`src/backends.ts` is pure: a `ps -eo comm=` dump goes in, a backend comes out. Detection is
process-name based and nothing else. Sockets were considered and dropped: `swww` publishes
`$XDG_RUNTIME_DIR/swww/socket`, but a stale socket proves less than a live process and costs
a filesystem probe on every apply.

Names match **exactly**. `ps -eo comm=` prints the executable name, so `skwd-editor` must
not match `skwd-wall` and `swww-daemon` must not match `swww`.

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

`awww` is checked before `swww` deliberately. `swww` was archived in October 2025 and
`awww` is the same author's successor (Codeberg, `LGFae/awww`, Arch `extra` 0.12.1); both
drive each other, so preferring the live daemon over the archived one is the only difference
that matters.

feh is installed here (`/usr/bin/feh`, 3.13.1-1, and `DISPLAY=:0` exists) but it will never
be auto-detected: it paints the X root window and exits, so a `feh` process exists only for
the moment it takes to set the wallpaper. It is reachable through the preference. `--bg-fill`
rather than `--bg-scale` (which distorts) or `--bg-tile` (which repeats) is the equivalent of
the "Cover" the Vicinae backends get.

### Skwd Wall is not a command line

v2 is a Rust rewrite on branch `v2` (default), and it is a GUI client — but it publishes a
JSON-RPC socket, and `wall.apply` is on its method list. So it needs a second `Step` shape,
a socket write, not an argv. Measured from the source rather than from a README, because the
shape is documented in neither:

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

A 10-second timeout on the round trip is not decoration. Without it a daemon that accepts the
connection and never answers hangs the action forever, which reads as a frozen Vicinae rather
than as a failure — and that is exactly what happened when the first version of this was
measured.

## The one thing that was actually changed in upstream source

`setDesktopWallpaper` called `runAppleScript`, telling System Events to put a picture on
every desktop. That is macOS, and the library throws here. It is now detect-then-apply, as
above.

`fit` is `"Cover"`, not `"fill"` — `WallpaperFit` in `@vicinae/api` is
`'Cover' | 'Contain' | 'Stretch' | 'Center' | 'Tile'` and has no `"fill"`. Apple's fill was
the closest, so `Cover`.

## Filters and sorting were not exclusive — the picker made them look that way

Upstream kept category, purity, sorting and top range as four `useState` strings behind **one**
`Grid.Dropdown`, whose items carried values like `"sort:relevance"` and `"cat:100"`. That dropdown
had `storeValue`, and a dropdown can only show one selected item. So choosing a category made the
sort mode look discarded, and choosing a sort mode made the category look discarded.

The API never required a choice. Measured on wallhaven.cc today:

```
?q=nature&categories=100&purity=100&sorting=relevance   → total 67086, ids zxqkdy 1jymd9 g7lzv7
?q=nature&categories=100&purity=100&sorting=date_added → total 67086, ids d8vv8j 1qoopg e8vvx8
```

Same total, different order: both parameters apply together. The restriction was entirely in the UI.

`src/filters.ts` models the state as one `Filters` object, and the categories became three independent
toggles rather than one choice out of seven masks.

### Categories are checkboxes, not presets

Upstream offered seven category masks as a single dropdown: All, General, Anime, People, and the three
pairs. wallhaven.cc has one checkbox per category and they compose. Measured today:

```
categories=110  → total 73364,   page has general and anime
categories=100  → total 67086,   page has general only, no anime
categories=000  → total 104629,  identical to 111
categories=101  → total 98351,   general and people
```

Two consequences. A mask list makes the common case — "general, but not anime" — a bitwise
subtraction no preset expresses. And `000` is not "nothing": wallhaven ignores it and returns
everything, so unchecking the last box must not produce it. `CategoryValue` does not include `"000"`
and `toggleCategory` returns the state unchanged rather than reach for it. The compiler enforces the
first part; `test/categories.test.ts` enforces the second.

### One dropdown, not four

Vicinae keeps **one** search-bar accessory:

```
grid-model.hpp:55    using GridSearchBarAccessory = std::variant<DropdownModel>;
grid-model.hpp:77    std::optional<GridSearchBarAccessory> searchBarAccessory;
model-deser.cpp:934  m.searchBarAccessory = toDropdownModel(std::move(c));   // assignment
extension-view-host.cpp:215-219   one updateDropdown(dropdown), one m_dropdownModel
```

Assignment, not `push_back`. A second `Grid.Dropdown` overwrites the first, and only the last child in
document order survives. An earlier revision of this port rendered four dropdowns and had one working.
`test/accessory.test.ts` counts them in the source and fails above one, so the limit cannot be
rediscovered the slow way.

Sections are how one dropdown holds several groups. Values are prefixed with what they mean —
`cat:100`, `pur:110`, `sort:views`, `range:1M` — because the dropdown reports the item and never the
section it came from. `applySelection` routes on the prefix and ignores anything it does not
recognise, because a value the runtime invented must not blank the search. Content and Top range are
exclusive and show a checkmark as their selection; the three categories toggle independently, which
is why they need one.

Two details that matter more than they look:

- **`value`, not `storeValue`.** Both show the current choice, but `storeValue` persists a value per
  dropdown across sessions and a stale one outranks the state above it. The display would then lie
  about what is being searched for. The active item is marked with `Icon.Checkmark` instead, and the
  dropdown's `value` is a snapshot of the whole selection rather than one item's value.
- **`q` is omitted, not sent empty, when the box is blank.** `?q=&…&sorting=relevance` answers total
  337562; omitting `q` answers a different set. `buildSearchQuery` is a separate pure function so
  this is checkable.

`top-wallpapers.tsx` takes its range from the same `filters` shape, so the values agree across commands.

Every action now has an icon. Nine actions, nine icons, checked mechanically against the built bundle.

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

`Icon.Photo` was the first guess for "Copy Image to Clipboard" and does not exist — the enum has
`Camera`, `Image` and `CopyClipboard`, and no `Photo`. `Image` is the honest one: the action puts an
image on the clipboard, which is not what `CopyClipboard` depicts.

## What was cut

**"Set on Current Desktop"** is gone. Every backend here sets every output: Noctalia takes
an optional connector and `swww img` has no per-monitor flag at all. Keeping the action
would have meant it quietly did the other thing. Its shortcut, `shift+cmd+W`, moved to the
surviving "Set Wallpaper" action.

**`my-collections` needs an account.** `username` and `apiKey` are both unset here, so the
command will show upstream's error. It is left as upstream wrote it because the keyless
half of the extension — search, top, random, download — is the part worth shipping.

## Verified

`npm run lint && npm run check && npm test && npm run build` all pass. 69 checks in seven files.

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
frames the way `wall-proto/src/client.rs` does. Four daemon behaviours: accepts, replies with
`error`, replies with garbage, and accepts-then-says-nothing. Plus a missing socket, plus a
check that `awww`/`swww`/`hyprpaper` reach `Wallpaper.set` and not a command line of our own.

Regressions put back there:

| Regression | Result |
| ---------- | ------ |
| the daemon's `error.message` dropped | `FAIL a daemon error is reported` |
| ENOENT replaced with the raw errno message | `FAIL a missing socket says so` |
| unparsable reply treated as success | `FAIL an unreadable reply is reported` |
| the 10s timeout removed | the suite hung — `timeout 45` exited 124 |
| `viaVicinae` bypassed | `Error: awww has no command to change the wallpaper` |

`test/filters.test.ts` (15), `test/categories.test.ts` (10), `test/selection.test.ts` (8),
`test/search-query.test.ts` (7), and `test/accessory.test.ts` (1, the single-dropdown count). These
exist because of the filtering bug above. The load-bearing ones are exhaustive:

```
for every one of the 7 category masks × 6 sort modes:  both survive
for every one of the 4 prefixes × every value it accepts: only its own field moves
for all 3 category bits, toggling on and off: reversible, and never 000
```

Regressions put back, each caught:

| Regression | Caught by |
| ---------- | --------- |
| `withFilter` reset to defaults when the key was `sorting` — exactly the old bug | 3 failures in `filters.test.ts` |
| `sfwOnly` stopped overriding purity | `FAIL safe search overrides purity` |
| sorting deleted `categories` in the query | `FAIL a category and a sort mode travel in the same request` |
| `q=""` sent as `q=` | `FAIL an empty search term is not sent` |
| the `000` guard removed | `FAIL the last standing category cannot be switched off` |
| toggling rebuilt the whole mask from `111` instead of flipping one bit | 4 failures in `categories.test.ts` |
| `cat:` handled as a preset instead of a toggle | `FAIL cat: toggles the category and nothing else` |
| `sort:` routed into `categories` | `FAIL sort: replaces the sort mode and nothing else` |
| a second `Grid.Dropdown` added | `test/accessory.test.ts`: `expected exactly 1, found 4` |

The apply path was run against the real compositor, not simulated:

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

and the original wallpaper was set back afterwards. `wallpaper-get` returned the original
path again.

All four commands load with no error: `Loaded extension wallhaven:search-wallpapers`,
`top-wallpapers`, `my-collections`, `random-wallpaper`, each followed by `Started extension`
and no error.

## Not verified

**The dropdown was not opened.** The built bundle has one `Grid.Dropdown` with four sections
(`Categories`, `Content`, `Sort by`, `Top range`) and prefixed values (`cat:`, `pur:`, `sort:`,
`range:`), and the command loads with no error — but nobody pressed it. The behaviour it fixes is
verified at the state and query level, 41 checks across five files, not through the UI.

**That a second dropdown would have been silently dropped was not observed, only read.** The
`assignment not push_back` evidence in `grid-model.hpp` and `model-deser.cpp` is unambiguous, and
`test/accessory.test.ts` enforces it against our own source. But an earlier revision of this port did
render four dropdowns, and it was only caught by reading the C++ — the rendered count at the time was
not measured.

**The action icons were verified as data, not as pixels.** All nine are present in the installed
bundle and each of the nine actions has exactly one. That they *look* right is not established.

**The lists were not seen rendering.** Loading is not rendering. The network side was
measured independently (`GET /api/v1/search` returns the ten keys the parser reads:
`category`, `colors`, `resolution`, `thumbs`, `path`, `id`), but no one looked at the grid.
`my-collections` was not exercised at all — it needs credentials.

**No backend other than Noctalia was run live.** `awww`, `swww`, `hyprpaper`, `swaybg`,
`feh`, `mpvpaper`, `waypaper` and `skwd-wall` are in the table from their own documentation
and source: `awww-img.1.scd` on Codeberg for the `awww img` shape, `waypaper/__main__.py` for
`--wallpaper`, feh's man page for `--bg-fill`, and the swaybg restart is inferred from the
fact that swaybg has no IPC at all. hyprpaper 0.9 moved to the hyprwire object protocol,
which is why it is routed through `Wallpaper.set` and never through a socket.

**Skwd Wall's stub is not the real daemon.** `skwd-wall` is neither installed nor in the
Arch repositories, so `wall.apply` was verified against a stub built to
`wall-proto/src/client.rs`'s framing, and the parameter shape was read out of
`encode_apply`. If the daemon turns out to require a field beyond `{type, path}`, the stub
will not catch it. Its own UI sends `output`, `notify`, `mute` and `volume` as well, which
are deliberately left out here so the daemon keeps its own defaults.

**`Wallpaper.set` was never run** — it cannot be, with neither `swww` nor `awww` installed.
The tests assert the call reaches it with `fit: "Cover"`, which is not the same as the
server honouring it. `pacman -S awww` would make the awww and swww rows testable for real.