# LAN File Share

Share files, folders and text with devices on the same network: start sharing,
open the link or scan the QR code — the other device gets a page with
download, upload and text. Nothing is installed on the other side, unlike
KDE Connect.

Port of [shaomai98/lan-file-share](https://github.com/raycast/extensions/tree/main/extensions/lan-file-share)
for Raycast (MIT). The service and the web page are upstream's, almost verbatim.

## How it works

The command starts `assets/service/server.js` as a detached Node process, so
sharing continues after the launcher closes. It listens on two ports:

| Port | Bound to | For |
| --- | --- | --- |
| `7330` | `127.0.0.1` | Control: status, stop, list changes. Fixed, no authentication |
| `7331` (preference) | the chosen interface's IPv4 | The page and its API, for the other devices |

Panel and service talk through `config.json`, `list.json` and `qr.png` in the
support directory; the service re-reads the config on every request, so a new
receive directory applies without a restart.

- Files and folders are **referenced where they are**, never copied. Removing an
  entry from the list does not touch the file.
- Uploads from the browser go in 8 MB chunks to the receive directory, are
  assembled on completion, and are added to the list. A broken upload resumes;
  unfinished chunks older than 24 hours are removed on start.
- Several files or a folder download as a streamed zip (Zip64 above 4 GB). A
  single file supports `Range`, so video seeks.
- A visitor can only reach what is on the list. A path that leaves its entry,
  absolute or through `..` or a symlink, is refused with 403.
- The service stops by itself within five seconds of Vicinae exiting. It does
  not stop when the command closes.
- No telemetry and no outside requests. The page's scripts are bundled.

## Security

No authentication: anyone who can reach the address can download everything,
upload and remove list entries. Use it on a trusted network, not public Wi-Fi.

The control port is open to every local user of the machine on a shared computer.

## Keybindings

| Action | Key |
| --- | --- |
| Start Sharing | `ctrl+s` |
| Stop Sharing | `ctrl+shift+s` |
| Add Files Or Folders | `ctrl+n` |
| Copy Address | `ctrl+shift+c` |
| Open in Browser | `ctrl+o` |
| Restart Service | `ctrl+shift+r` |
| Open Receive Directory | `ctrl+shift+o` |
| Refresh | `ctrl+r` |
| Open Extension Preferences | `ctrl+shift+k` |

The named ones (`new`, `copy`, `open`, `refresh`) follow your `keybinds`.

## Preferences

- **Port**: 1024 to 49151, default 7331. `7330` is refused. An unusable value
  falls back to the default and the panel says why. Needs a restart.
- **Receive Directory**: where browser uploads land, default `~/Downloads`.

## Requirements

- Vicinae with a Node runtime (the service runs on the same `node`).
- Optional: `lsof`, only to name the program that holds a busy port. Without it
  the message says the port is taken, without a name.
- If the page opens on this machine but not on a phone, the firewall is
  dropping it: allow incoming TCP on the port (`ufw allow 7331/tcp`, or the
  `firewalld` equivalent). The check after starting cannot see that.

## What the port changed

- `@raycast/api` and `@raycast/utils` became `@vicinae/api`. There is no
  `showFailureToast` in it; `src/api/toast.ts` is a four-line replacement.
- **Cut:** `Share Finder Selection` (Finder does not exist; the picker and the
  list on the page remain). The separate `Change Port` action: it opened the same
  preferences as `Open Extension Preferences`.
- The interface list ranks real cards (`enp4s0`, `wlp3s0`) before `docker0`,
  `br-*`, `virbr0`, `veth*` and the like. Sorted by name alone, Docker's bridge
  became the default and the link did not open from a phone. Virtual devices stay
  selectable.
- Port owner lookup uses `lsof` from `PATH`; upstream had macOS's
  `/usr/sbin/lsof`, and the parser is checked against real `lsof -F pcu` output.
- The QR code is a plain markdown image; Vicinae renders it and honours
  `raycast-width`. Upstream wrapped it in HTML for Raycast's centering.
- The firewall hint is shown in the panel while sharing, replacing macOS's one-time
  "allow incoming connections" dialog.
- Code is split into `api/`, `utils/` and `components/`.

## Tests

`npm test`: the `lsof` parser (fixture from the real tool's output), port
validation, interface ranking — each confirmed to fail when the code under test
is broken.

## Not verified

- Not launched: no Vicinae binary here; lint, `tsc --noEmit --noUnusedLocals`
  and `vici build` pass. Not seen: the `Loaded extension lan-file-share:share`
  log line, the list rendering, the dropdown, the form and the toasts. The QR
  image through Vicinae's image provider is read from its source, not observed.
- Starting and stopping through the panel (`startService`, `stopService`) is
  upstream's code with changed wording. Only the service was driven directly.
- No other device on the network was reachable from the build environment —
  the firewall behaviour is documented, not measured. Measured against the real
  service: status, bound interface, download, `Range`, path escapes (relative
  and absolute), unknown entry, folder zip with `unzip -t`, three-chunk upload
  out of order, the QR file, web assets, and exit within 5 s of the host dying
  (~4.8 s). Not covered: files over 4 GB, symlinks, the browser UI, many
  parallel visitors.
