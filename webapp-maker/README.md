# Webapp Maker

Create Chromium-based web apps from websites as desktop entries. Supports Helium, Chromium, Thorium, Brave, and Chrome.

## Features

- **Create Webapp**: Form to create a web app with name, URL, extra flags, and optional icon (URL or local file). Icons are fetched from the site automatically if not provided.
- **Manage Webapps**: List created web apps, edit (URL/flags/icon/backend/name), and remove them with their icons.
- **Browser support**: Helium, Chromium, Thorium, Brave, Chrome. Uses `--app` mode for Chromium-family browsers.

## Preferences

| Preference | Type | Default | Description |
| --- | --- | --- | --- |
| Browser Backend | dropdown | Auto-detect | Browser to use for web apps. Supports Helium, Chromium, Thorium, Brave, Chrome, or auto-detect. |
| Environment File | textfield | (empty) | Path to a file with environment variables for icon downloads and launching. |

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

- Uses a launcher script installed in the extension's support directory to resolve the browser at launch time.
- Desktop entries are written to `~/.local/share/applications/` and icons to `~/.local/share/icons/hicolor/256x256/apps/`.
- Only removes entries whose `Exec` uses the webapp launcher.
- Editing can rename the `.desktop` entry; the launcher base directory is refreshed.
- Ported from the Noctalia [`webapp-maker`](https://github.com/noctalia-dev/community-plugins/tree/main/webapp-maker)
  plugin (MIT) by [umedbazarov](https://github.com/UmedjonBA), which was in turn inspired by Omarchy's
  `omarchy-webapp-install`. Edit, rename and remove with shortcuts are additions made here.
