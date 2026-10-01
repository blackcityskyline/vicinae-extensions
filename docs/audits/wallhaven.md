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
| mpvpaper | `mpvpaper` | `mpvpaper <path>` |
| waypaper | `waypaper` | `waypaper --wallpaper <path>` |
| Skwd Wall | `skwd-wall`, or `skwd` | **nothing** — recognised, and reported as undrivable |

`awww` is checked before `swww` deliberately. `swww` was archived in October 2025 and
`awww` is the same author's successor (Codeberg, `LGFae/awww`, Arch `extra` 0.12.1); both
drive each other, so preferring the live daemon over the archived one is the only difference
that matters.

Skwd Wall has no `apply` on purpose. It is a wallpaper selector, and there is no documented
command to set a wallpaper from a shell; guessing one would be worse than saying so, so the
error names it and points at preferences.

## The one thing that was actually changed in upstream source

`setDesktopWallpaper` called `runAppleScript`, telling System Events to put a picture on
every desktop. That is macOS, and the library throws here. It is now detect-then-apply, as
above.

`fit` is `"Cover"`, not `"fill"` — `WallpaperFit` in `@vicinae/api` is
`'Cover' | 'Contain' | 'Stretch' | 'Center' | 'Tile'` and has no `"fill"`. Apple's fill was
the closest, so `Cover`.

## What was cut

**"Set on Current Desktop"** is gone. Every backend here sets every output: Noctalia takes
an optional connector and `swww img` has no per-monitor flag at all. Keeping the action
would have meant it quietly did the other thing. Its shortcut, `shift+cmd+W`, moved to the
surviving "Set Wallpaper" action.

**`my-collections` needs an account.** `username` and `apiKey` are both unset here, so the
command will show upstream's error. It is left as upstream wrote it because the keyless
half of the extension — search, top, random, download — is the part worth shipping.

## Verified

`npm run lint && npm run check && npm test && npm run build` all pass. 12 checks in
`test/backends.test.ts`; they fail if `detached` is dropped from the swaybg restart or if
exact-name matching becomes a substring match (both regressions were put back to confirm).

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

**The lists were not seen rendering.** Loading is not rendering. The network side was
measured independently (`GET /api/v1/search` returns the ten keys the parser reads:
`category`, `colors`, `resolution`, `thumbs`, `path`, `id`), but no one looked at the grid.
`my-collections` was not exercised at all — it needs credentials.

**No backend other than Noctalia was run.** `awww`, `swww`, `hyprpaper`, `swaybg`,
`mpvpaper`, `waypaper` and `skwd-wall` are in the table from their own documentation and
source, not from a live daemon: `awww-img.1.scd` on Codeberg for the `awww img` shape,
`waypaper/__main__.py` for `--wallpaper`, and the swaybg restart is inferred from the fact
that swaybg has no IPC at all. hyprpaper 0.9 moved to the hyprwire object protocol, which
is why it is routed through `Wallpaper.set` and never through a socket.

**`Wallpaper.set` was never exercised** — it cannot be, with neither `swww` nor `awww`
installed. `pacman -S awww` would make the awww/swww rows testable.