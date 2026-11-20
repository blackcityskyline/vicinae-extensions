# Code to Image

Write or paste a snippet, pick a language and theme, and get a shareable image.
Rendering is done by [codetoimage.com](https://codetoimage.com) — free, no
account, no API key.

## Requirements

- Network access to `codetoimage.com`.
- A folder to save into; it is created on the first render.

## Commands

| Command | Does |
| --- | --- |
| Create Image | A form for the snippet, language, theme, format, line numbers and a window frame; renders it, saves the file, then previews it |

The form opens with the clipboard's text already in the code field when that
text fits the service's limits. Nothing is sent until **Render Image** is
pressed.

## What leaves the machine

The snippet, language, theme and layout choices are sent over HTTPS to
`codetoimage.com`, which renders the image server-side. Their API documentation
says renders are stateless and the code is not stored; it also advises against
sending private code without authorization. There is no analytics, no account
and no other endpoint. The rendered file is written locally and is not uploaded
anywhere else.

The last used language and theme are kept in Vicinae's cache and the language
and theme list for seven days, so opening the form does not hit the network
every time.

## Keys

| Where | Key | Action |
| --- | --- | --- |
| Form | `ctrl+enter` | Render Image |
| Form | `ctrl+o` | Open codetoimage.com |
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
| Save Folder | `~/Pictures/code-to-image` | Where rendered files go; `~` is expanded and missing folders are created |

## Formats

- **PNG** at 2× pixel density, measured on 2026-11-20: 968×472 took 2.7 s.
- **SVG**, vector, measured at 0.5 s.

The service accepts at most 20 000 characters and 500 lines; the form refuses
more with the number it counted.

## Not verified

- Pasting the copied image into an image field: the clipboard carries the file
  as `text/uri-list`, the only form `Clipboard.copy` offers here, not raw
  `image/png`.
- The SVG preview in the result pane; only a PNG result was rendered on screen.
- Failure toasts for a service error; the empty-code validation was checked on
  screen, but a real 4xx/5xx from the render endpoint was not provoked.

## Development

```bash
npm install
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/code-to-image/create-image'
```
