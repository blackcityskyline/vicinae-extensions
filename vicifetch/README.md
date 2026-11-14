# Vicifetch

A fastfetch view for the launcher: the distribution logo on the left, the machine
facts on the right — user@host, OS, kernel, WM/DE, packages, shell, OS age,
uptime, Vicinae version and font.

Runs one `fastfetch --json` call and formats the JSON; fastfetch's terminal output
is never parsed. Needs `fastfetch` on `PATH` (`sudo pacman -S fastfetch`);
without it the view says so and offers the install command.

## Where values come from

- **Shell** is the process that draws the desktop, from `hyprctl layers -j`; bars,
  docks and panels give that process the most surfaces, and a generic runtime
  (`qs`, `quickshell`) is climbed out of. Compositors that cannot be asked fall
  back to matching a known shell process; with neither, the row is absent.
  fastfetch's own Shell module reports the Node worker and is not used.
- **Uptime** comes from fastfetch's milliseconds, **Vicinae** from
  `environment.vicinaeVersion.tag`, **Font** from the first font fastfetch
  reports with its toolkit tag stripped.
- **OS age** is days since pacman installed `filesystem`; Arch only, absent
  elsewhere.
- **Packages** is fastfetch's count plus the owning manager. **WM/DE** prefers the
  desktop environment.

## The logo

The left pane is fastfetch's own logo from the same run (`--logo <ID>` from
`/etc/os-release`, since the bare `Logo` module returns the small variant), with
`$1`–`$9` colour markers stripped. It is drawn as a monospace `<span>` with
`<br/>`, not a code block, which would add a card, border and header. Without a
distro logo the pane falls back to the image from `/etc/os-release` under
`/usr/share/pixmaps` and hicolor dirs; with neither it shows the `user@host` line.

Below the facts, one row of squares shows the active theme's `[colors.accents]`
from `~/.config/vicinae/themes/<name>.toml`; a builtin theme has no file and the
row is absent. The squares travel as a rich-text `<img>` of a 20 px strip, since
`TagList` draws a padded chip that cannot be blended away on the translucent
launcher.

## Keys

`ctrl+shift+c` copy summary, `ctrl+r` refresh.
