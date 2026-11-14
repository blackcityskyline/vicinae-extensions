# AppImage Manager

Install, update and remove AppImages, and configure the ones another launcher put
there.

A Vicinae front end for [`bmaltais/StartAppImage`](https://github.com/bmaltais/StartAppImage),
the Omarchy plugin: its bash CLI ships in `assets/startappimage` and does the work
— reading metadata, adopting existing launcher entries, downloading updates,
removing what an install created. The plugin's QML window and bar widget are not
used.

## Commands

| Command | Does |
| --- | --- |
| Manage AppImages | installed images: open, update, configure, uninstall, install more |
| Install AppImage | the install form alone, for a keybinding or deeplink |

## Actions

| Action | Key |
| --- | --- |
| Open | `ctrl+o` |
| Update to the Latest Release | `ctrl+u` |
| App Settings | `ctrl+e` |
| Uninstall | `ctrl+d` |
| Install AppImage… | `ctrl+n` |
| Refresh | `ctrl+r` |

## How it works

`list --json` prints one record per app. On every read the CLI also adopts any
launcher entry whose `Exec` runs an `.AppImage`, tagged `External`, which is why a
first open writes `~/.local/share/startappimage/<app>.env` for each adopted app.

`add` copies the image into the install folder (default
`~/.local/share/appimages`), links it into `~/.local/bin`, writes a `.desktop`
entry and keeps an icon. `remove` deletes all of it; for an adopted app that
includes the AppImage file itself, as the confirmation says.

Updates are an action, not a background timer. An app updates only when its
**Update Source** is set: `owner/repo` or a GitHub link, checked on save, where
the latest release must contain an AppImage for this CPU.

## Settings

Per app: Name, Launch Options (arguments in the launcher entry), Update Source,
App Launcher (show or hide the entry), and Location (move the image inside your
home). `Open` runs the image directly, so Launch Options apply only when the app is
started from the application list.

## Requirements

`unsquashfs` from squashfs-tools (to read an image's name, version and icon
without running it; Install stops with `missing dependency: unsquashfs`), plus
`jq` and `curl`. No key, preference or daemon.
