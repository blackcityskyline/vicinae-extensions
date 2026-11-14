# Wi‑Fi Commander

Fork of [dagimg-dot/wifi-commander](https://github.com/vicinaehq/extensions/tree/main/extensions/wifi-commander),
deployed from upstream's TypeScript sources instead of the store bundle. The
manifest, commands and behaviour are upstream's; four files were corrected to
compile under this repository's `strict` and `noUncheckedIndexedAccess`.

Wi‑Fi control over `nmcli` or `iwctl`: radio on/off, restart, disconnect, scan
and connect, saved networks, hotspot.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `toggle-wifi-on` / `toggle-wifi-off` | no-view | Radio on or off |
| `restart-wifi` | no-view | Restart the Wi‑Fi service |
| `scan-wifi` | view | Nearby networks, signal, security; connects with a password form or straight to a saved one |
| `manage-saved-networks` | view | Saved connections; connect, disconnect, forget, toggle auto-connect |
| `create-hotspot` | view | Name, password and band, then `nmcli device wifi hotspot` |

`create-hotspot` is `nmcli` only: with `iwctl` it shows a notice. When the uplink
is the same adapter, the hotspot takes the radio and the station connection drops,
so there is no internet unless a wired port or a second adapter carries it.

Hidden networks can be joined with `iwctl` only. Copy actions exist for SSID,
BSSID and UUID; the metadata panel carries the rest.

## Keys

Scan view: `Cmd+Enter` connect, `Cmd+D` disconnect, `Cmd+C` copy SSID,
`Cmd+Shift+C` copy BSSID, `Cmd+R` refresh.

Saved view: `Cmd+Enter` connect, `Cmd+D` disconnect, `Cmd+Delete` forget,
`Cmd+C` copy name, `Cmd+Shift+C` copy UUID, `Cmd+R` refresh, `Cmd+A` toggle
auto-connect (`iwctl` only).

## Requirements

Linux with NetworkManager, and `nmcli` or `iwctl` on `PATH`.

```bash
npm install
npm run lint && npm run check && npm run build
```

The manifest and the upstream changes are recorded in
[`docs/audits/wifi-commander.md`](../docs/audits/wifi-commander.md).
