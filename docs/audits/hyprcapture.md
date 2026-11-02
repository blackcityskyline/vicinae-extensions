# HyprCapture audit

Measured on 2026-11-01 against the real compositor and the loaded plugin, not
against the README. Everything below was run on this machine; anything that was
not run is named as such at the end.

## Versions

| Thing | Value |
| ----- | ----- |
| Hyprland | `Hyprland 0.56.2`, commit `efb50993780079460b0cbed1363e2166a2de1d9f` |
| HyprCapture plugin | `0.4.2` (`hyprctl plugin list`: `Plugin HyprCapture by wilf`) |
| Plugin binary | `/home/black/.config/hypr/plugins/hyprcapture/libhyprcapture.so`, 37,831,024 bytes, 2026-10-28 23:32 |
| `hyprcapture-ui` | `/home/black/.local/bin/hyprcapture-ui`, 83,068,688 bytes, 2026-10-28 17:00 |
| Monitor | `LVDS-1`, 1366x768, scale 1, transform 0, at `0,0` |
| Session | Wayland, one monitor |

`hyprpm list` reports the HyprCapture repository as `Plugin failed to build`,
but the plugin is loaded manually from the Lua config and `hyprctl plugin list`
shows it. The failed hyprpm entry is a packaging state, not a runtime state.

Config in `~/.config/hypr/plugins/hyprcapture.lua` leaves the plugin defaults:
`save_dir = $XDG_PICTURES_DIR/Screenshots`, `allow_quick = false`,
`fullscreen_scope = all`, `overlay_scope = fix`, `save = true`,
`clipboard = true`, `thumbnail = true`, `screenshot_notification = true`.

## Native overlay: `open`

`hyprctl eval "hl.plugin.hyprcapture.open('region')"` (and `window`,
`fullscreen`) returns `ok` in **0.03-0.07 s**. It does **not** wait for the
overlay: `hyprcapture-ui` starts about 0.1 s later and keeps running. The
returned status says nothing about success or cancellation.

The plugin starts:

```
hyprcapture-ui --mode region|window|fullscreen --fullscreen-scope all
  --overlay-scope fix --save 1 --clipboard 1 --thumbnail 1
  --screenshot-notification 1 --include-cursor 0
  --confirm-before-capture 0 ... --save-dir $XDG_PICTURES_DIR/Screenshots ...
```

### Timings and files

| Interaction | File appears | `hyprcapture-ui` exits |
| ----------- | ------------ | --------------------- |
| fullscreen, Enter to accept | ~1.1 s after Enter | ~5.4 s after Enter |
| region, drag and release | ~1.2 s after release | ~6.2 s after the open call |
| window, click and Enter | ~1.0 s after Enter | ~7.8 s after the open call |
| any mode, Esc | no file | immediately after Esc |

The process outlives the saved file by about five seconds because it keeps the
thumbnail on screen (`--thumbnail-timeout-ms 5000`). Reopening Vicinae before it
exits would put the launcher underneath a live layer surface.

Success writes a PNG into the configured save directory **and** a
`thumbnail-preview-<pid>-<timestamp>-<n>.png` into
`/dev/shm/hyprcapture-$UID/`. Esc writes neither. That thumbnail file is the
only success signal available to a caller that does not read the save
directory, and it is created before the UI exits. With both `save` and
`thumbnail` disabled there is no external success signal; that combination was
not measured.

The file name and path are chosen by HyprCapture. `open` does not return the
path. The extension must not write into `save_dir`.

### Cancellation

Esc exits `hyprcapture-ui` with no saved file and no thumbnail preview.
`hyprctl eval` has already returned `ok` long before that, so cancellation can
only be observed by watching the process and the output signals above. There is
no exit code to read.

### Launcher in the frame

Vicinae is a layer-shell surface at layer **2** (`namespace: vicinae`).
`hyprcapture-ui` is at layer **3**. `vicinae close` returns in **5 ms** and the
Vicinae layer is gone by the next `hyprctl layers -j` poll. A fullscreen
HyprCapture shot freezes the screen when `open` is called, not when Enter is
pressed: closing Vicinae while the overlay is already open still leaves the
launcher in the saved frame.

Measured with a static full-screen terminal behind the launcher, comparing the
saved frame against a reference with and without Vicinae:

| Case | Vicinae in frame |
| ---- | ---------------- |
| launcher left open | yes (pixel-identical to the reference) |
| close, then `open` immediately (0 ms) | no |
| close, wait 200 ms, then `open` | no |
| close, wait 500 ms, then `open` | no |
| `open`, then close the launcher while the overlay is live | yes |

So the safe rule is: close the launcher, wait until `hyprctl layers -j` has no
`vicinae` namespace, then call `open`. The fixed 200 ms sleep used by the other
backends happens to be enough here, but the layer check is the measured
condition.

While the overlay is open, `hyprctl activewindow` still reports the previous
client (the layer surface is not a window), and injected keys (`wtype -k
Return`, `wtype -k Escape`) reach the overlay. The overlay owns the keyboard
while it is up.

### Save directory option

`hyprctl getoption plugin:hyprcapture:save_dir` prints the value on one line and
`set: ...` on the next:

```
str: $XDG_PICTURES_DIR/Screenshots
set: false
```

Only the first line is the path. Reading the whole output gives
`.../Screenshots\nset: false`, which is not a directory and makes the saved file
unfindable.

### Through the extension

`captureScreenshot(hyprcaptureBackend, "full")` was run against the real plugin
on 2026-11-01, with `@vicinae/api` stubbed. `wtype -k Return` 1.5 s after the
call made it return `{kind: "handoff", path: ".../Screenshot-2026-11-01-141227.png"}`;
that file was a 1366x768 RGBA PNG. `wtype -k Escape` made it throw
`CaptureCancelled` and write nothing. The wait ends only after
`hyprcapture-ui` exits, which is why the launcher can be reopened afterwards.

Area and window modes were not driven through the extension: both need a drag or
a click on the overlay.

## Export pipe

Request, exactly as measured:

```json
{"version":1,"responseFifo":"/dev/shm/hyprcapture-1000/iskra-.../response.fifo","mode":"fullscreen","fullscreenScope":"all"}
```

The client must create the two FIFOs inside `/dev/shm/hyprcapture-$UID/`, with
the client directory `0700` and the FIFOs `0600`, owned by the caller. A
request FIFO outside that root, a group/other-writable FIFO, or a
group/other-writable directory is rejected by `hyprctl eval` with
`error: invalid export pipe request fifo` and no response. A response FIFO
outside the allowed root gives `error: invalid export pipe response fifo`.
Malformed JSON gives `error: invalid export pipe request json`. These errors
are on `hyprctl`'s stderr; the response FIFO stays empty.

### Accepted requests

| `mode` | Result |
| ------ | ------ |
| `fullscreen` | accepted |
| `monitor`, `all`, unknown | accepted and treated as fullscreen (the parser only rejects `region` and `window`) |
| `region` | `{"ok":false,...,"error":"export pipe only supports fullscreen mode"}` |
| `window` | same error |

| `fullscreenScope` | Result |
| ----------------- | ------ |
| `all` | accepted |
| omitted | accepted, defaults to all |
| `current` | `{"ok":false,...,"error":"export pipe only supports fullscreenScope=all"}` |
| `focused`, `monitor`, unknown | accepted and treated as all |

Only `fullscreen` + `all` is a documented, stable request. iskra will send only
that pair; unknown values must not reach the Lua string.

`version: 2` makes `hyprctl eval` fail with
`error: unsupported export pipe protocol version` and writes nothing to the
response FIFO.

### Response

A real response begins:

```
HYPRCAP_PIPE_V1\n
237\n
{"ok":true,"version":1,"format":"rgba8888","topDown":true,"monitors":[{"name":"LVDS-1","geometry":{"x":0.0,"y":0.0,"width":1366.0,"height":768.0},"scale":1.0,"transform":0,"artifactWidth":1366,"artifactHeight":768,"byteLength":4196352}]}
```

Then exactly `sum(monitors[].byteLength)` bytes of RGBA8888 follow, in header
order. On this machine that is 4,196,352 bytes (1366 x 768 x 4); the whole
response is 4,196,609 bytes and arrives in about 0.14 s. `topDown` was `true`,
`format` was `rgba8888`, `transform` 0, `scale` 1. The first pixel bytes were
`39 16 00 ff` (R, G, B, A).

An error response has the same magic and length-prefixed header, then no
frames:

```
HYPRCAP_PIPE_V1\n
76\n
{"ok":false,"version":1,"error":"export pipe only supports fullscreen mode"}
```

`hyprctl eval` itself returns `ok` for an error response; the error is only in
the response JSON. A protocol error (bad version, bad FIFO path) is the other
way round: `hyprctl` exits non-zero and the response FIFO is empty.

### Ordering, timeouts, concurrency

`hyprctl eval` returns before the frame is fully written. The writer can block
on the response FIFO. Opening the response reader late still works: a reader
opened 0.5 s after the request received the full frame. Two requests in
parallel both succeeded while the first writer was blocked on an unread
response FIFO; there is no global "one export at a time" lock. A reader that is
never read leaves the writer blocked until the reader closes, and a reader
closed early ends that writer; it does not affect a later request.

This means the client must always open the response reader first, read until
the header's declared byte count, and impose its own timeout. Waiting for EOF
is not safe with a FIFO opened read-write.

### Through the extension

The pipe backend was run against the real plugin on 2026-11-01. `capture("full")`
and `capture("monitor", "LVDS-1")` each produced a 1366x768 RGBA PNG, and
`captureRegion("100,100 200x150", ...)` a 200x150 one, all decoded by
ImageMagick. The first live run found the region arguments swapped (the output
path was parsed as a geometry); the interface's order is `(geometry,
outputPath)`, and a bad geometry now fails before any frame is requested.

## Failure modes seen from `hyprctl eval`

| Condition | Exit | Message |
| --------- | ---- | ------- |
| invalid request or response FIFO, malformed JSON, unsupported protocol version | non-zero | `error: ...` on **stderr**, no response bytes |
| session lock set (`PROTO::sessionLock->isLocked()`) | 7 | `error: [string "..."]:1: session locked` on **stdout**, empty stderr, no response bytes |

The session-lock error is the one a stale locker leaves behind: `hyprctl
locked` said `true` while no locker process existed, and every `open` and
`export_pipe` call failed this way until the compositor was unlocked. A client
that reads only stderr reports a bare `Command failed`.

## What was not measured

- A second monitor, non-zero transform, or scale other than 1. The header
  carries those fields, but their pixel layout was not exercised.
- Area and window capture through the native overlay: both need a pointer
  gesture on the overlay, so only fullscreen was driven end to end.
- `allow_quick`, `quick`, recording, the `recording.sock` state socket, and the
  editor/pin modes.
- Window mode without pressing Enter after the click, and the exact key that
  confirms a window selection.
- A response reader left unread long enough to hit the plugin's internal
  `EXPORT_PIPE_WRITE_TIMEOUT`.
- Whether `open`'s return value carries anything; `hyprctl eval` discards it
  and prints `ok`.
- The minimum Hyprland version. The plugin was built and loaded against
  0.56.2; the README's Lua configuration is what this machine uses.

## Fixtures

`iskra/test/fixtures/hyprcapture-pipe.bin.gz` is the real 237-byte header
above, followed by a uniform `0x11 0x22 0x33 0xff` payload of the real
`byteLength`. The header and sizes are real; the pixel payload was replaced so
that a desktop capture is not committed. The error fixture is the real 95-byte
error response.
