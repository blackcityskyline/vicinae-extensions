# LAN File Share

Share files, folders and text with any device on the same network. Start sharing,
open the link or scan the QR code, and the other device gets a page in its
browser: download, upload, preview, send text. Nothing is installed on the
other side, which is the difference from KDE Connect.

Port of [shaomai98/lan-file-share](https://github.com/raycast/extensions/tree/main/extensions/lan-file-share)
for Raycast (MIT). The service and the web page are upstream's, almost verbatim.

## How it works

The command starts `assets/service/server.js` as a detached Node process, so
sharing continues after the launcher closes. It listens on two ports:

| Port | Bound to | For |
| --- | --- | --- |
| `7330` | `127.0.0.1` | Control: status, stop, list changes. Fixed, no authentication |
| `7331` (preference) | the chosen interface's IPv4 | The page and its API, for the other devices |

The panel and the service talk through `config.json`, `list.json` and `qr.png`
in the extension's support directory; the service re-reads the config on every
request, so a new receive directory applies without a restart.

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

There is **no authentication**. Anyone who can reach the address can download
everything on the list, upload into the receive directory and remove list
entries. Use it on a network you trust, not on public Wi-Fi.

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
- **A firewall rule.** If the page opens on this machine but not on a phone, the
  firewall is dropping it: allow incoming TCP on the port (`ufw allow 7331/tcp`,
  or the `firewalld` equivalent). The check after starting runs on this machine
  and cannot see that.

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
- The QR code is a plain markdown image. Upstream wrapped it in HTML to beat
  Raycast's centering; Vicinae renders the image as written and honours
  `raycast-width`.
- The firewall hint is shown in the panel while sharing, replacing macOS's one-time
  "allow incoming connections" dialog.
- Code is split into `api/`, `utils/` and `components/`.

## Tests

`npm test` runs three self-checks: the `lsof` parser (fixture taken from the real
tool's output), port validation, and interface ranking. Each was confirmed to fail
when the code under test is broken.

## Not verified

- **The panel has not been launched in Vicinae.** The build here has no Vicinae
  binary. Lint, `tsc --noEmit --noUnusedLocals` and `vici build` pass; the
  `Loaded extension lan-file-share:share` log line, the list rendering, the
  dropdown, the form and the toasts have not been seen. The QR image going through
  Vicinae's image provider is read from its source, not observed.
- Starting and stopping through the panel (`startService`, `stopService`) is
  upstream's code with changed wording. Only the service was driven directly.
- A device on the network other than this machine: nothing else was reachable from
  the build environment, so the firewall behaviour is documented, not measured.
- Service checked against a real process: status, bound interface, download,
  `Range`, path escapes (relative and absolute), unknown entry, folder zip with
  `unzip -t`, three-chunk upload out of order, the QR file, web assets, and the
  exit within five seconds of the host process dying (about 4.8 s measured).
  Not covered: files over 4 GB, symlinks, the browser UI, many parallel visitors.
