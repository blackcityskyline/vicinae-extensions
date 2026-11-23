# Custom Store

Browse your own sources of extension bundles as one list: install a package,
uninstall, skip the built-in store. Sources are summed — every source is read
at the same time, the rows merged.

## Sources

| Kind | Example | Read as |
| --- | --- | --- |
| Local folder | `~/dev/extensions` | every child directory that is a built bundle |
| Index URL | `https://example.com/store` | `index.json` at that URL, or below it |
| Git repository | `https://github.com/you/store` | shallow clone, then as a local folder |

The `Repository` preference is the first source and cannot be removed; changing
it edits the extension's settings. Others are added: `Manage Sources`
(`ctrl+shift+s`) → `Add Source`, kept in Vicinae's local storage — the
`Preference` tag on that page.

A Git source is cloned once into `~/.cache/custom-store/<hash>`
(`XDG_CACHE_HOME` honoured) and read from the cache afterwards, so opening the
store makes no network call; `Refresh` pulls. GitHub, GitLab, Codeberg,
Bitbucket, `ssh://`/`git@`/`file://` or `.git` count as Git; every other
`http(s)` URL is an index. A private repository fails instead of waiting for
credentials — the launcher has no terminal to type them.

Two sources listing the same `name`: the earlier provides the row — the
preference first, then the added sources in order. A source that cannot be read
keeps its own section of reasons while the other sources keep their rows.
Removing a source leaves its clone; delete it to reclaim the space.

## Repository format

One package per immediate child of a local folder or Git repo: a
`package.json` and whatever the package needs. A child without a readable
`package.json` is skipped with a warning. Both built bundles and source trees
are listed; Install builds the latter.

A remote index is `index.json`; relative `archive` and `icon` paths resolve
against it:

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
| Manage Sources | `ctrl+shift+s` |
| Add Source, on the sources page | `ctrl+n` |
| Add Source, in the form | `ctrl+s` |
| Remove Source | `ctrl+x` |

A built bundle is copied through `.staging-<id>` and renamed into place — a
half-copied package never becomes visible — except one from a Git clone, which
is copied without its `.git` directory. An extension's source tree is built:
`npm install` when there is no `node_modules`, then the package's `build`
script (`vici build` for a Vicinae extension) writes the bundle into the
extensions directory itself. That runs the repository's code; without
checked-in dependencies it uses the network too. A build that exits non-zero,
or does not produce the extension directory, is reported as a failed install.
Install replaces a same-named directory, because the manifest has no version.

Uninstall deletes the directory and its `support/` data after a confirmation.
The registry rescans within 100 ms, so a new extension appears without a
restart.

## Preferences

| Name | Notes |
| --- | --- |
| Repository | required; the first source; a folder of bundles or an `http(s)` URL serving `index.json`; `~` expands |

`unzip` (Info-ZIP) is needed for archive installs, `git` for Git sources.

The repository format is this extension's own, not an upstream spec.
