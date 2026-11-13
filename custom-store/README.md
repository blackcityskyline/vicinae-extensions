# Custom Store

Browse a repository of extension bundles and read what it holds. The built-in
store talks to `api.vicinae.com`; this one reads a directory or an `index.json`
that you name in the preference, so it can serve extensions the store never saw.

## Commands

| Command | Description |
| --- | --- |
| **Custom Store** | The repository list: title, description, author, and an `Installed` tag |

## Repository format

The format is this extension's own; there is no upstream spec. Both shapes are
described with their measurements in [`docs/audits/custom-store.md`](../../docs/audits/custom-store.md).

### A local directory

Every immediate child is a package: a built bundle with `package.json`, the
compiled `*.js` entrypoints and `assets/`, which is exactly what `vici build`
leaves in `~/.local/share/vicinae/extensions`. A child without a readable
`package.json` is skipped with a warning and does not appear in the list.

### A remote URL

The preference points at `index.json` or at the directory serving it; a directory
URL gets `index.json` appended. Relative `archive` and `icon` paths resolve
against the index.

```json
{
  "extensions": [
    {
      "name": "player-pilot",
      "title": "Player Pilot",
      "description": "Control every running media player.",
      "author": "black",
      "icon": "icons/player-pilot.png",
      "archive": "player-pilot.zip"
    }
  ]
}
```

An entry without an archive cannot be installed and is not shown.

## Actions

Open the panel with `ctrl+b`.

| Action | Shortcut | Description |
| --- | --- | --- |
| Install | `ctrl+i` | Copy the bundle into `~/.local/share/vicinae/extensions`, replacing an older install |
| Uninstall | `ctrl+shift+x` | Delete the installed directory and its `support/` data, after a confirmation |
| Refresh | `ctrl+r` | Re-read the repository |

Installing replaces an existing directory of the same name; the Vicinae manifest
has no version field, so there is nothing to compare. An archive is extracted
through `extensions/.staging-<id>` and renamed into place, so a half-extracted
download never becomes a visible extension. The registry watches that directory
and rescans within 100 ms, so the new extension appears without a restart.

## Preferences

| Name | Required | Description |
| --- | --- | --- |
| Repository | Yes | A directory of built extension bundles, or an `http(s)` URL serving `index.json`. A leading `~` expands to your home directory |

## Requirements

`unzip` for archive installs (Info-ZIP; the `unzip` package on Arch). A local
bundle needs nothing beyond Node's own `fs`.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/custom-store/custom-store'
```
