# Vicifetch

A fastfetch view for the launcher: the distribution logo on the left, the machine facts on the right.

```
user@hostname
OS
Kernel
WM/DE
Packages
Shell
OS age
Uptime
Vicinae
Font
```

## fastfetch is the source

The extension runs one `fastfetch --json` call and formats the JSON itself; it
does not parse fastfetch's terminal output. `docs/audits/vicifetch.md`
has the timing that decided this.

Needs `fastfetch` on `PATH`:

```bash
sudo pacman -S fastfetch
```

Without it the view says so, offers the install command, and stays open so
Refresh works after the install.

## Where the values come from

- **Shell** is the shell that draws the desktop, not the login shell from
  `/etc/passwd` and not the terminal shell. Hyprland is asked which process owns
  its layer surfaces (`hyprctl layers -j`, `src/api/desktop-shell.ts`); bars,
  docks and panels give that process the most surfaces, and the row names it,
  climbing out of a generic runtime (`qs`/`quickshell` is what `dms` runs as).
  A different shell therefore appears on its own. Compositors that cannot be
  asked fall back to matching a known shell process. When neither finds one the
  row is absent. fastfetch's `Shell` module is not used: it reports the Node
  worker that started it.
- **Uptime** is `2d 3h` from fastfetch's milliseconds; **Vicinae** is the
  launcher's own version (raw tag from `environment.vicinaeVersion.tag`); **Font**
  is the first font fastfetch reports, with its toolkit tag stripped
  (`Noto Sans (10pt)`).
- **OS age** is the number of days since pacman installed the `filesystem`
  package, read from `/var/lib/pacman/local/filesystem-*/desc`. It is the same
  arithmetic as `~/bin/fetchs/fetch1`. Arch-only: on a machine without pacman
  the row is absent rather than guessed.
- **Packages** is the count fastfetch reports plus the manager that owns it.
- **WM/DE** prefers the desktop environment when one is running, otherwise the
  window manager.

## The logo

The left pane is fastfetch's own logo from the same run: the `Logo` module is
requested with `--logo <ID>`, where `<ID>` comes from `/etc/os-release`, because
the bare `Logo` module returns the seven-line small variant. fastfetch's `$1`-`$9`
colour markers are stripped.

The art is drawn on the plain pane, not in a code block: a markdown code block
brings a card, a border and a `Copy` header that an extension cannot turn off, and
it fits only fifteen of the nineteen rows. Inline HTML passes through the
renderer untouched, so the art is a monospace `<span>` with `<br/>` between rows.
Markdown still parses the art's backticks and backslashes, so those are escaped.

If fastfetch has no logo for the distribution, the pane falls back to the image
named by `/etc/os-release`: `LOGO=archlinux-logo`, then `<id>-logo`, under
`/usr/share/pixmaps` and the hicolor icon directories, as PNG or SVG, passed as a
`file://` URL. A markdown image cannot exceed 200 px in height (`MdImage.qml`
caps it), which is why it is the fallback and not the main path. With no image
either, the pane shows the `user@hostname` line.

## The palette

Below the facts sits one row of squares in the launcher's own colours: the
`[colors.accents]` of the active theme. The theme name comes from
`~/.config/vicinae/settings.json` (`theme.dark.name` / `theme.light.name`,
following the current appearance), the colours from `<name>.toml` under
`~/.local/share/vicinae/themes`. `lighter`/`darker` shades are resolved the way
Qt does it, by scaling the value channel, and accents that resolve to one colour
collapse into one square. A builtin theme has no file on disk, so the row is
absent there instead of being invented.

A metadata row is a `Text` in `AutoText` mode, so the squares travel as a
rich-text `<img>` pointing at a 20 px strip the extension writes into its support
directory. `TagList` would have been the obvious choice, but every tag is drawn
as a rounded chip with 6 px of padding around its icon, and the launcher window
is 50 % translucent (`launcher_window.opacity`), so the chip cannot be blended
away — it reads as a box behind each square.

## Actions

| Action | Key |
| --- | --- |
| Copy Summary | `ctrl+shift+c` |
| Refresh | `ctrl+r` |
| Copy Install Command | only shown when fastfetch is missing |

The summary is plain text: the `user@hostname` line followed by `Label: value`
for each row.
