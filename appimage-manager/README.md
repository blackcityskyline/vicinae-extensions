# AppImage Manager

Install, update and remove AppImages, and configure the ones another launcher put there.

It is a Vicinae front end for [`bmaltais/StartAppImage`](https://github.com/bmaltais/StartAppImage),
the Omarchy plugin: its 886-line bash CLI ships in `assets/startappimage` and does every piece of
work — reading an image's metadata, adopting existing launcher entries, downloading updates,
removing what an install created. The plugin's QML window and bar widget are not used.

## Commands

| Command              | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| **Manage AppImages** | Installed AppImages: open, update, configure, uninstall, install more |
| **Install AppImage** | The install form on its own, for a keybinding or a deeplink           |

## Actions

| Action                       | Shortcut  | Description                                              |
| ---------------------------- | --------- | -------------------------------------------------------- |
| Open                         | `ctrl+o`  | Start the AppImage                                        |
| Update to the Latest Release | `ctrl+u`  | Download the newest GitHub release over the installed one |
| App Settings                 | `ctrl+e`  | Name, launch options, update source, launcher entry, folder |
| Uninstall                    | `ctrl+d`  | Delete the app, its launcher entry and its icon           |
| Install AppImage…            | `ctrl+n`  | The install form                                          |
| Refresh                      | `ctrl+r`  | Re-read the list                                          |

`ctrl+o` and `ctrl+n` are the launcher's generic *open* and *new* verbs, so a keybind remap is
honoured.

## Requirements

- `unsquashfs` from **squashfs-tools** (`extra`): reading an image's name, version and icon
  without running it needs it. Without the package, Install stops with
  `missing dependency: unsquashfs`.
- `jq` and `curl`, both already present on any Arch install with Omarchy-era tooling.
- Nothing to configure: no API key, no preference, no daemon.

## How it works

`list --json` prints one record per app, and the extension renders it. On every read the CLI also
**adopts** any launcher entry whose `Exec` runs an `.AppImage`, so apps installed by AppImageLauncher
or by hand show up here tagged `External`; that is why a first open writes
`~/.local/share/startappimage/<app>.env` for each adopted app.

`add` copies the image into the install folder (default `~/.local/share/appimages`), links it into
`~/.local/bin`, writes a `.desktop` entry and keeps an icon. `remove` deletes all of it — and for an
adopted app it deletes **the AppImage file itself**, which is what the confirmation says.

Update checks are not a background timer: the plugin ran one every six hours inside the Omarchy
shell. Here an update is an action, and `Update Source` on an app is what makes it updateable at all.
A source is a GitHub repository, typed as `owner/repo` or pasted as a link, and it is checked when
you save it: the latest release must contain an AppImage for this CPU.

## Settings

Per app, on the App Settings form:

| Setting        | Effect                                                            |
| -------------- | ----------------------------------------------------------------- |
| Name           | The name in the app launcher and in this list                     |
| Launch Options | Extra arguments in the launcher entry, e.g. `--no-sandbox`        |
| Update Source  | `owner/repo` whose releases are checked; empty means no updates   |
| App Launcher   | Show or hide the `.desktop` entry without uninstalling            |
| Location       | Move the image to another folder inside your home                 |

Launch Options live in the launcher entry, and `Open` runs the image directly, exactly as the
plugin's own manager does — so they apply when the app is started from Vicinae's application list,
not from this extension.

Every app lives in its own `~/.local/share/startappimage/<app>.env`; the folder for new installs is
remembered in `~/.config/startappimage/config`. Both belong to the CLI, not to this extension.
