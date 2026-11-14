# Bitwarden Vault

Search your Bitwarden vault, copy or paste credentials and generate one-time
codes. Fork of the official Raycast extension, rewritten against
`@vicinae/api` for Linux.

## Requirements

- The Bitwarden CLI (`bw`), for example `sudo pacman -S bitwarden-cli`.
- A Bitwarden **client_id** and **client_secret** from
  [account settings](https://vault.bitwarden.com/settings/account-security).
- `bw` on `PATH`, or its path filled in.

## Commands

| Command | Does |
| --- | --- |
| Search Vault | fuzzy-search every item; copy or paste any field |
| Authenticator | live TOTP codes, the active tab's site first |
| Generate Password | password or passphrase, with a live preview |
| Generate Password (Quick) | generate and copy or paste without a view |
| Create Login / Create Folder | add an item or a folder |
| Lock Vault / Logout | lock and drop the session, or clear it |

## Keys

`Alt` is the primary modifier. On an item: `Alt+P` copy password, `Ctrl+Alt+P`
paste, `Alt+U` username, `Alt+T` TOTP, `Alt+O` open URL, `Alt+N` notes,
`Alt+F` favourite, `Alt+R` sync, `Alt+L` lock.

## How it differs from the Raycast original

- Runs the installed `bw`; no 100 MB binary is downloaded.
- Filtering is Vicinae's fuzzy matcher over each item's `keywords`, not a
  bundled search library.
- "On screen lock" asks `systemd-logind` whether the session is locked instead
  of macOS's system-log query.
- TOTP uses `otpauth`; the CLI runs through `node:child_process`.

## Not verified

`npm test` checks TOTP against the RFC 6238 vectors; the vault flows were not
driven against a live account here.

Originally written by [jomifepe](https://github.com/jomifepe) for
[Raycast](https://www.raycast.com), MIT.
