# tempmail

A temporary mailbox with a disposable address, for the signups that want one:
make an address, watch the countdown, read the mail, copy the code, throw it away.

`Check For Mail` runs in the background every minute, notifies about new mail,
deletes an address whose lifetime ran out and keeps the launcher row's subtitle
current.

## Commands

| Command | Does |
| --- | --- |
| Open Mailbox | the address, the countdown, the inbox and its actions |
| Check For Mail | every minute: notifications, expiry, the launcher row |
| Reset TempMail | throw the address away with its mail and saved HTML pages |

## Lifetimes

A new address lives 10 or 30 minutes. `Extend by N Minutes` adds 1–30, and no
address lives more than 60 minutes from now however often it is extended. When
the lifetime ends the address is deleted on the server and locally, and a
notification says so. An address from before lifetimes existed has no expiry and
is left to its owner.

## Backend

`mail.tm`. The Raycast upstream names `mail.gw`, whose API answers 502 here; the
domains are read live from `GET /domains`, since the list rotates and the API
rejects anything else. Everything is limited to 30 requests a minute, so the
inbox polls every 10 seconds by default and a 429 is reported, not retried.

## Preferences

| Setting | Default | Does |
| --- | --- | --- |
| Address Lifetime | 10 minutes | what a new address is given |
| Extend By | 10 minutes | what Extend adds, 1–30, under the 60-minute ceiling |
| Check For Mail Every | 10 seconds | visible polling; `Never` leaves only Refresh |
| New Mail Notifications | on | sender only |

## Notes

- Codes come from `verifications`, then the prose, up to three; copy is
  `concealed`.
- `Open HTML Version` writes the mail as one inert document (CSP blocks scripts,
  objects and forms) under the extension's support directory; the message id is
  checked against `^[a-f0-9]{24}$` first.
- Nothing is downloaded: attachments are named and sized, and remote images are
  not fetched. Plain text is preferred over HTML.
- The first look at an inbox never notifies; seen ids persist in `LocalStorage`,
  capped at 100.
- The one chord this extension sets is `Cmd+Backspace`; the rest are Vicinae's
  actions.

## Not verified

Receiving mail. Register, token, list, read, mark-seen and delete run against the
live API, but nothing ever arrives: `POST /messages` answers 405, and the domain's
MX host `in.mail.tm` is unreachable on 25 and 443 here. Notifications, the
background subtitle, the browser handoff and the rendered lists were not seen.

Ported from [Joshlucpoll/tempmail](https://github.com/raycast/extensions/tree/main/extensions/tempmail)
and [AhmadRun/temp-mail](https://github.com/AhmadRun/temp-mail), both MIT.
