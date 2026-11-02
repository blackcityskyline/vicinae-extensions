# Default Apps

View and change default applications for common MIME types and schemes using `xdg-mime`.

## Features

- **Manage Default Apps**: List common categories (browser, mail, calendar, files, music, video, images, editor, PDF, archive, word processor, torrent) with current defaults and available candidates.
- **Set defaults**: Choose an application from the submenu to set it as default for all related MIME types/schemes.
- **Refresh**: Re-scan applications and re-query defaults.

## Requirements

- Linux with `xdg-utils` installed (`xdg-mime`).

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/default-apps/manage'
```

## Notes

- Scans desktop entries from standard XDG paths and Flatpak export paths.
- Browsers are excluded from non-browser category candidate lists (same behavior as the Noctalia plugin).
- Ported from the Noctalia `default-apps` plugin by Thaer99ob.
