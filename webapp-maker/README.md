# Webapp Maker

Create Chromium-based web apps from websites as desktop entries. Supports Helium, Chromium, Thorium, Brave, and Chrome.

## Features

- **Create Webapp**: Form to create a web app with name, URL, extra flags, and optional icon (URL or local file). An empty icon fetches the site's touch icon, then `/apple-touch-icon.png`, then Google's favicon service; whatever is downloaded must really be an image, or it is refused. A theme icon name is accepted too and needs no file.
- **Manage Webapps**: List created web apps, edit (URL/flags/icon/backend/name), and remove them with their icons. Editing keeps the flags; renaming moves the icon with the app.
- **Browser support**: Helium, Chromium, Thorium, Brave, Chrome. Uses `--app` mode for Chromium-family browsers.

## Preferences

| Preference | Type | Default | Description |
| --- | --- | --- | --- |
| Browser Backend | dropdown | Auto-detect | Browser to use for web apps. Supports Helium, Chromium, Thorium, Brave, Chrome, or auto-detect. |
| Environment File | textfield | (empty) | A file of `KEY=VALUE` lines (`export` allowed) passed to `curl` when an icon is downloaded, for a proxy or a certificate bundle. It is not read when a web app launches |

## Shortcuts (Manage)

| Action | Shortcut |
| --- | --- |
| Edit | `Cmd+E` |
| Remove | `Cmd+X` |

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/webapp-maker/create'
vicinae 'vicinae://launch/@black/webapp-maker/manage'
```

## Notes

- A name that already exists is refused rather than overwritten.

- Uses a launcher script installed in the extension's support directory to resolve the browser at launch time.
- Desktop entries are written to `~/.local/share/applications/` and icons to `~/.local/share/icons/hicolor/256x256/apps/`.
- Only removes entries whose `Exec` uses the webapp launcher.
- Editing can rename the `.desktop` entry; the launcher base directory is refreshed.
- Ported from the Noctalia [`webapp-maker`](https://github.com/noctalia-dev/community-plugins/tree/main/webapp-maker)
  plugin (MIT) by [umedbazarov](https://github.com/UmedjonBA), which was in turn inspired by Omarchy's
  `omarchy-webapp-install`. Edit, rename and remove with shortcuts are additions made here.
