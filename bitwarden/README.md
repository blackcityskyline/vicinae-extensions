# Bitwarden Vault — Vicinae extension

A native [Vicinae](https://vicinae.com) extension for your Bitwarden vault: search
items, copy or paste credentials, and generate one-time codes.

Forked from the official Raycast Bitwarden extension and rewritten against
`@vicinae/api` for Linux.

## Requirements

- [Vicinae](https://docs.vicinae.com/install/linux) with a running server
- The Bitwarden CLI (`bw`), e.g. `sudo pacman -S bitwarden-cli` on Arch
- A Bitwarden **client_id** and **client_secret** from
  [account settings](https://vault.bitwarden.com/settings/account-security)

## Setup

Open the extension's settings in Vicinae and fill in the client ID and secret.
The CLI path can be left empty to use the first `bw` on your `PATH`.

## Commands

| Command                 | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| Search Vault            | Fuzzy-search every item; copy or paste any field        |
| Authenticator           | Live TOTP codes, with the active tab's site listed first |
| Generate Password       | Password/passphrase generator with a live preview       |
| Generate Password (Quick) | Generate and copy or paste without opening a view     |
| Create Login            | Add a login item to the vault                           |
| Create Folder           | Add a folder to the vault                               |
| Lock Vault              | Lock immediately and drop the session                   |
| Logout                  | Clear the stored session                                |

## Keyboard shortcuts

`Alt` is the primary modifier. On an item: `Alt+P` copy password, `Ctrl+Alt+P`
paste, `Alt+U` username, `Alt+T` TOTP, `Alt+O` open URL, `Alt+N` notes,
`Alt+F` favourite, `Alt+R` sync, `Alt+L` `Shift` lock.

## How it differs from the Raycast original

- **Uses the system CLI.** No bundled 100 MB binary is downloaded; the extension
  runs whatever `bw` is installed.
- **Built-in search.** Filtering is Vicinae's own fuzzy matcher, driven by each
  item's `keywords`, instead of a bundled JavaScript search library.
- **Linux vault timeout.** "On screen lock" asks `systemd-logind` whether the
  session is locked, replacing the macOS system-log query.
- **Leaner dependencies.** TOTP uses `otpauth`; the CLI runs through
  `node:child_process` rather than a process-spawning wrapper.

## Development

```bash
npm install
npm run dev     # hot reload, logs to this terminal
npm run build   # type-check and install into ~/.local/share/vicinae/extensions
npm test        # TOTP checks against the RFC 6238 vectors
```

## Credits

Originally written by [jomifepe](https://github.com/jomifepe) and contributors
for [Raycast](https://www.raycast.com). Licensed under MIT.
