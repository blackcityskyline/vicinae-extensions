# Code to Image

Write or paste a snippet, pick a language and theme, and get a shareable image.
It renders online through [codetoimage.com](https://codetoimage.com) — free, no
account, no API key — or locally through [silicon](https://github.com/Aloxaf/silicon),
when that is installed.

## Requirements

Pick one renderer in the preferences:

- **codetoimage.com** (default) needs network access; no account or key.
- **silicon** needs the CLI: `sudo pacman -S silicon` (Arch `extra`, 6.5 MiB
  installed). It renders PNG only and never touches the network.

Either way, a folder to save into; it is created on the first render.

## Commands

| Command | Does |
| --- | --- |
| Create Image | A form for the snippet, language, theme, line numbers and a window frame; renders it, saves the file, then previews it |

The form opens with the clipboard's text already in the code field when that
text fits the service's limits. Nothing is rendered until **Render Image** is
pressed.

## Renderers

| Renderer | Where | Formats | Choices | Measured |
| --- | --- | --- | --- | --- |
| codetoimage.com | Their server | PNG (2×), SVG | 37 languages, 38 themes | PNG 968×472 in 2.7 s, SVG in 0.5 s |
| silicon | This machine | PNG | 37 languages, 24 bat themes | 5-line Python snippet in 0.2 s, 686×432 |

The language names are the same in both and silicon accepts the same
identifiers. Themes are not: codetoimage's list and bat's list are different
sets, so the choice is remembered per renderer. silicon draws its own style —
rounded window, its default background — rather than copying codetoimage's.

## What leaves the machine

Only with the codetoimage renderer. The snippet, language, theme and layout
choices are sent over HTTPS to `codetoimage.com`, which renders the image
server-side. Their API documentation says renders are stateless and the code is
not stored; it also advises against sending private code without authorization.
There is no analytics, no account and no other endpoint. The rendered file is
written locally and is not uploaded anywhere else.

With silicon nothing leaves the machine: the snippet goes to the CLI on stdin,
not in the process arguments, so it is not readable from `/proc`.

The last used language and theme are kept in Vicinae's cache, separately per
renderer; the online language and theme list is cached for seven days, so
opening the form does not hit the network every time.

## Keys

| Where | Key | Action |
| --- | --- | --- |
| Form | `ctrl+enter` | Render Image |
| Form | `ctrl+o` | Open codetoimage.com (online renderer only) |
| Form, options failed | `ctrl+r` | Retry loading languages and themes |
| Preview | `ctrl+shift+c` | Copy the image file to the clipboard |
| Preview | `ctrl+o` | Open the image in its default application |
| Preview | `ctrl+shift+f` | Show the file in the file manager |
| Preview | `ctrl+shift+,` | Copy the file path |
| Preview | `ctrl+e` | Back to the form, to edit and render again |

Shortcuts come from Vicinae's named actions, so they follow your `keybinds`.

## Preferences

| Preference | Default | Does |
| --- | --- | --- |
| Renderer | codetoimage.com | Online with PNG/SVG, or local with silicon |
| Save Folder | `~/Pictures/code-to-image` | Where rendered files go; `~` is expanded and missing folders are created |

## Formats

PNG is drawn on codetoimage's gradient at 2× pixel density. SVG is requested
with no background of its own (`backgroundVisible: false`), so in the preview
the launcher's theme colour shows through and, embedded, the page's colour does
— the snippet card is the only opaque part.

## Limits

Both renderers go through the same check: at most 20 000 characters and 500
lines, with the number it counted in the message. codetoimage documents those
limits; silicon has no such limit of its own.

## Not verified

- The line-number and window-frame checkboxes with silicon on screen: the CLI
  flags behind them (`--no-line-number`, `--no-window-controls`) were exercised
  headless and change the output, but were not toggled in the form.
- Pasting the copied image into an image field: the clipboard carries the file
  as `text/uri-list`, the only form `Clipboard.copy` offers here, not raw
  `image/png`.
- Failure toasts for a service error; empty-code validation and silicon's own
  language/theme errors were checked, but a real 4xx/5xx from the render
  endpoint was not provoked.

## Development

```bash
npm install
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/code-to-image/create-image'
```
