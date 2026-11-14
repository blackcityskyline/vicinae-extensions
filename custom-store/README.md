# Custom Store

Browse a repository of extension bundles and read what it holds. Unlike the
built-in store, the source is a directory or an `index.json` you name, so it can
serve extensions the store never saw.

## Repository format

A local directory: every immediate child is a package — a `package.json`, the
compiled `*.js` entrypoints and `assets/`, exactly what `vici build` leaves in
`~/.local/share/vicinae/extensions`. A child without a readable `package.json`
is skipped with a warning.

A remote URL: the preference points at `index.json`, or at a directory that gets
`index.json` appended. Relative `archive` and `icon` paths resolve against the
index.

```json
{
  "extensions": [
    {
      "name": "player-pilot",
      "title": "Player Pilot",
      "description": "Control every running media player.",
      "archive": "player-pilot.zip",
      "icon": "icons/player-pilot.png",
      "readme": "docs/player-pilot.md",
      "downloads": 1234
    }
  ]
}
```

`name`, `title`, `description` and `archive` are required; the rest is rendered
when present. `archive`, `icon`, `avatar`, `readme` and `source` accept relative
or absolute URLs. An entry without an archive is not listed.

## Actions

| Action | Key |
| --- | --- |
| Show Details | `enter` |
| Install | `ctrl+i` |
| Uninstall | `ctrl+shift+x` |
| Refresh | `ctrl+r` |

Install replaces a directory of the same name (the manifest has no version to
compare), extracts through `.staging-<id>` and renames into place, so a
half-extracted download never becomes visible. Uninstall deletes the directory
and its `support/` data after a confirmation. The registry rescans within 100 ms,
so a new extension appears without a restart.

## Preferences

| Name | Notes |
| --- | --- |
| Repository | required; a directory of bundles or an `http(s)` URL serving `index.json`; `~` expands |

`unzip` (Info-ZIP) is needed for archive installs.

The repository format is this extension's own, not an upstream spec; see
[`docs/audits/custom-store.md`](../docs/audits/custom-store.md).
