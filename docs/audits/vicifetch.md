# Audit: a fastfetch face for the launcher

Written from scratch: the distribution logo on the left and, on the right,
`user@hostname`, OS, kernel, WM/DE, packages, shell and OS age. Measured on this
machine on 2026-11-10.

## Why fastfetch

| Source | Time | Shape |
| --- | --- | --- |
| `fastfetch --json --logo none --structure title:os:kernel:wm:de:packages` | 11–23 ms | One JSON array, one object per module |
| `inxi -xxx` (3.3.41) | 951 ms | Three lines of ANSI-coloured human text |
| `lshw -json` | — | Not installed |
| `/proc`, sysfs | — | No package manager, no WM name, no install age; each field would be its own parser |

fastfetch 2.70.0 wins on both counts: two orders of magnitude faster than inxi's
colourised report, and named fields instead of text to parse. The extension
formats the JSON itself — a data source, not a screenshot of fastfetch's terminal
output.

## The one field that lies

`Shell` reports the shell that launched fastfetch: `bash`/`fish` from a terminal,
`node` from the extension (the worker is the parent). The login shell is
`Title.userShell` (`/bin/fish` here), which is what the view shows, verified by
comparing both module results in the same run.

## Layout: why the metadata panel

A fastfetch card is two unequal columns. Vicinae's `Detail` renders one markdown
column plus a metadata side panel, which is what shipped: the logo is the
markdown, the seven lines are `Detail.Metadata.Label`s.

Alternatives checked in the runtime source, not guessed:

- HTML blocks are stripped to escaped text (`processHtmlNodes` in
  `ui/quick/markdown-model.cpp` keeps text and extracts `<img>`, no tags), so an
  HTML table cannot place a logo beside text.
- An `<img>` inside any markdown block is extracted into a separate image block,
  so it cannot sit in a table cell either.
- GFM tables render, but a cell cannot hold a multi-line logo without abusing
  `<br/>`, and the card would fight the metadata panel.

The distro image in the pane was too small: the markdown image renderer caps
height at 200 px (`MdImage.qml`: `Math.min(_rawH, 200, maxImageHeight)`), and no
`?raycast-height=` value goes past it, while the pane is about 330 px tall.

So the left pane is the ASCII logo: the `Logo` module of the *same* fastfetch
run, with `--logo <ID>` from `/etc/os-release`. The bare module returns the
seven-line `arch_small`; the ID returns the nineteen-row art
(`['arch','archmerge']`, 37 columns). A second call was rejected: `fastfetch
--json --structure logo --logo arch` costs another 15–20 ms and duplicates the
parsing, so the module rides along in the call that produces the facts.

## The clean surface

A fenced code block brings a card: `MdCodeBlock.qml` draws a rounded rectangle
with the border and `secondaryBackground`, a header row containing a `Copy` label
(`visible: true`, not configurable from an extension), and 10 px margins.
Nineteen rows then needed ~400 px in a ~350 px pane, so four rows had to go,
which read as vertically squashed.

The way out is inline HTML. `markdown-model.cpp` copies `CMARK_NODE_HTML_INLINE`
literal text into the block's HTML verbatim (`renderOneInline`), and `MdParagraph`
renders that with `TextEdit.RichText`. So a `<span style="font-family:monospace;
font-size:13px">` gives monospace text on the plain pane background, and a raw
`<br/>` gives the line breaks. Measured with a probe render:

- `<br/>` works inside the span, and so does `&nbsp;`-style padding; 19 rows at
  13 px fit the pane with room, and the same rows at 12 px leave a 37 px gap.
- `font-size` in percent (`85%`, `150%`) is ignored by Qt's rich text parser; only
  `px`/`pt` take effect, so the size is fixed in px.
- The art's own characters are markdown syntax: backslash, backtick, `_`, `*`,
  `<`, `>`, `&`, `[`, `]` and `~` are escaped. A backtick otherwise opens a code
  span and the rest of the art turns into literal `<br/>` text; `_`/`*` pair into
  emphasis and drop out; `<` can open a tag. Measured on the Void logo, which has
  both `_` and `*`: the unescaped render left a stray stroke at the bottom left
  of the art (10 368 pixels changed in the art block, 36–449 × 199–514, once the
  escapes were added). Debian's art also has `_`; Ubuntu's and NixOS's have none
  of these characters.
- Centring the block is not available: `<div align="center">` swallows the
  `<br/>` breaks and collapses the art onto one line, and stacking `<p
  align="center">` per line does the same; `<div align="center">` with plain
  `<br>` centres *each line separately*, which bends the shape. A fixed 11
  non-breaking-space indent centres it closely at the default window size, and it
  drifts when the window is resized.

The image path stays as the fallback, from `/etc/os-release`'s `LOGO` value
(`archlinux-logo` → `/usr/share/pixmaps/archlinux-logo.png`) passed as a `file://`
URL; a bare path produced Vicinae's placeholder image. With neither art nor
image, the pane shows `user@hostname`.

## Shell

`/etc/passwd` (`Title.userShell`) is the login shell and fastfetch's `Shell`
module reports the process that started fastfetch — inside Vicinae a Node worker.
Neither draws the desktop, and the terminal shell is not it either. The
compositor is asked instead: `hyprctl layers -j` lists every layer surface with
its owning pid, and the pid with the most surfaces is the desktop shell
(`src/utils/desktop-shell.ts`). Measured here: pid 1450018 owns `dms:bar`,
`dms:dock`, `dms:dankisland` and `dms:tooltip`, while `skwd-paper` and
`snappy-switcher` own one surface each, so 1450018 wins.

That pid is `qs` — `dms` (pid 1450000) runs its quickshell under the generic
runtime name, so the name is taken from the nearest ancestor that is not a known
runtime (`qs`, `quickshell`): `dms`. A different shell changes the answer with no
code change; only a fresh thin-runtime name would need adding to that set.

No Hyprland (or no socket) means no pid, and the fallback matches a process from
a short list of known shells (`dms`, `noctalia-shell`, `waybar`, …). When neither
finds anything the row is omitted rather than filled with the login shell. Cost
is one `hyprctl` call plus one `/proc` pass, only when the view loads.

## Filling the column

The requested lines left about 115 px empty under the last row of the metadata
column (measured on a 1365x768 screen). Hardware rows (CPU, memory, disk) and
GPU/display were rejected as noise, and so were load, the local address and the
machine model; what stayed is `Uptime` (fastfetch milliseconds as `2d 3h`),
`Vicinae` (the launcher's own version, `environment.vicinaeVersion.tag`, no extra
process) and `Font` (first entry of fastfetch's `fonts`, toolkit tag stripped).

## The palette

The squares under the facts are the launcher's accents, not a fixed list: the
theme name is read from `settings.json` (which carries `//` comments, stripped
before `JSON.parse`), and `[colors.accents]` from that theme's TOML under
`~/.local/share/vicinae/themes`. Only colours the theme defines appear, in a fixed
order (`blue cyan green yellow orange red magenta purple`); accents resolving to
the same colour collapse, because a row is what the panel has room for. A builtin
theme has no file on disk, so the row is absent.

Shades were measured on `dch.toml`: plain strings and `{ name = ..., lighter|darker
= N }` tables. Qt's `QColor::lighter(N)` scales the value channel by `1 + N/100`
and `darker(N)` divides by it (`theme-file.cpp:54`), so `#ffffff` with `darker =
100` is `#808080`, while `#ffb4ab` with `lighter = 40` stays `#ffb4ab` because its
value is already 255.

Routes rejected:

- `TagList` with a tinted 12 px square per tag: its icon is 12 px and the chip is
  `implicitWidth + 12` wide with `Theme.secondaryBackground` or a 20 % tint
  (`MetadataBar.qml`), which reads as a box. Setting the chip colour to the theme
  background does not hide it: the window is 50 % translucent
  (`launcher_window.opacity: 0.5` in `settings.json`), so the 20 % overlay lands on
  the blurred desktop and never matches.
- A markdown image under the art: that column is the left pane of
  `MarkdownDetailView` and the picture cannot reach the metadata column.
- `icons` rows of `MetadataBar.qml` would be chip-free, but the extension API has
  no component that emits them.

What works: the metadata value is a `Text` in the default `AutoText` mode, so
`<img src="file://…" width="116" height="20">` renders as rich text, right-aligned
in the row. Verified in a minimal Qt Quick harness: a `file://` `<img>` in an
`AutoText` `Text` paints the PNG at the given size (a `<table bgcolor>` variant
did not, which is why the strip is a PNG). The strip is 20 px cells with 4 px
gaps, transparent between them, written once per launch and named after its
colours so a changed palette is a new URL.

## OS age

`~/bin/fetchs/fetch1` takes the install epoch from pacman's metadata:

```
/var/lib/pacman/local/filesystem-2025.10.12-1/desc
%INSTALLDATE%
1779563469
```

and computes `(now - install) / 86400` in whole days. The port keeps that
arithmetic and the same reading of `desc`, so both agree on the same machine
(170 days on the day of measurement). No pacman, no row — the view does not fall
back to the root filesystem's birth time, a different date on btrfs.

## What is not shown

Hardware, storage, display, network, theme and font rows were removed when the
owner specified the seven lines. They are still available from fastfetch
directly; nothing in the extension needs them.

## Checks

`npm test` runs 9 checks:

- `/etc/os-release` quoting and `LOGO` extraction;
- the install date read from a real `desc` head, plus rejection of a malformed
  value;
- day arithmetic at the 24-hour boundary and against a clock that moved
  backwards;
- colour markers and trailing blanks stripped from logo art;
- the art turned into a monospace span with `<br/>` between rows, markdown
  punctuation escaped, and no bare newline left;
- the `Logo` module of the same run read into art, with a missing result giving
  `undefined`;
- the seven lines built from a captured fastfetch JSON (sanitised user name,
  real values otherwise), including the exact summary text;
- DE-over-WM precedence and the missing-age case;
- an empty module list naming the machine instead of throwing.

The fastfetch JSON fixture is `test/fixtures/fastfetch.json`, trimmed from a real
run to the six fact modules; the logo is exercised with inline art.

## Verified live

- `vicinae://launch/@black/vicifetch/vicifetch` logs
  `Loaded extension vicifetch:vicifetch`; stderr is empty.
- The rendered view shows all nineteen rows of the Arch ASCII logo on the plain
  pane — no card, no `Copy` header — and `User black@archlinux`, `OS Arch Linux`,
  `Kernel 6.18.59-1-lts`, `WM/DE Hyprland 0.56.2`, `Packages 1673 (pacman)`,
  `Shell fish`, `OS age 170 days` on the right.
- The fastfetch-missing branch and the Copy Summary keypress were not exercised
  by hand; the first is a message swap, the second is
  `Action.CopyToClipboard` with content covered by the summary check.
