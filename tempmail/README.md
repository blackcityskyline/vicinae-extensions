# tempmail

A temporary mailbox with a disposable address, for the signups that want one.
Read the mail, keep the address as long as you want it, throw it away when you
are done.

Ported from [`Joshlucpoll/raycast-extensions`](https://github.com/Joshlucpoll/raycast-extensions)
(Raycast, MIT). Same two commands, same inbox.

## The backend is mail.tm, not mail.gw

The upstream description says `mail.gw`. Its own source already points at
`mail.tm`, and that turns out to be the right one. Measured from this machine:

| | `/domains` | register | token | `/messages` |
| --- | --- | --- | --- | --- |
| `api.mail.gw` | **502** | **502** | — | — |
| `api.mail.tm` | 200 | 201 | 200 | 200 |

Same project, same hydra API. Nothing else was a substitute: `guerrillamail`,
`disposable.de`, `1secmail`, `mailnesia` and `trashmail` all failed to answer.

One domain is currently offered, `uberip.com`, and the API rejects the rest —
registering on `@mail.tm` answers 422 `The domain "mail.tm" is not valid`. The
domain list is read live rather than hardcoded for exactly that reason.

## Polling is slower than upstream, on purpose

The API publishes a limit and the launcher shows it:

```
ratelimit-policy: 30; w=60
```

Thirty requests a minute, for everything. Upstream polls every 5 seconds, which
is twelve a minute before you open, read or delete anything. `Check For Mail
Every` defaults to 10 seconds, so the inbox costs six and there is room left.
`Never` turns polling off and leaves `Cmd+R`.

`/token` has a separate, much larger budget — sixty back-to-back requests all
answered 200 — so the token is cached and only re-fetched after a 401.

## What the port changed, and why

**`fetch` instead of `axios`.** Node 26 has it built in.

**No `moment`.** Upstream formats every date with `moment().humanize()` and
`moment().format()`. Both follow the machine's locale, which turns `10 Mar` into
`3/10` and midnight into `12:00 AM`. `src/utils/when.ts` builds the strings from
their parts. The same note appears in `shell-history` and `in-the-time-zone`.

**No `unique-names-generator`.** Upstream builds addresses like
`angry-purple-bear-417`. A hex string does the same job, and some signup forms
reject long addresses.

**Inline attachments are not downloaded when a message opens.** Upstream fetches
every attachment as soon as the message is read — five attachments is five of the
thirty requests a minute, for files you may never open. Here the row shows the
name and size, and the first action downloads it.

**Images in the mail are not fetched.** Upstream downloads every image URL in the
body into its support directory and rewrites `src=` to a `file://` path, so that
a markdown renderer which will not load remote images still shows them. Two
reasons not to: whether the renderer loads a `file://` image is not something I
can confirm, and fetching arbitrary URLs chosen by whoever sent the mail is a
fetch-on-behalf-of primitive you do not want in a launcher. Inline images in HTML
mail may not render. The rest of the body converts fine.

**The list filter is on.** Upstream sets `filtering={false}`, so nothing in the
inbox is searchable. Here the builtin filter runs over sender, subject and the
message preview.

**Plain text beats HTML.** Upstream only ever reads `html[0]`, so a mail that
sends both gets its formatting mangled by an HTML-to-markdown converter for no
reason. `src/utils/body.ts` uses `text` when the sender provided one.

**Paging stops on a short page.** Upstream recurses until its page arithmetic
happens to add up, which never finishes against a server that keeps returning 30.
Here it stops at the first short page, with a hard cap of ten pages behind it.

## Commands

| Command | Does |
| --- | --- |
| Open Mailbox | the inbox, the address, and the actions |
| Reset TempMail | throw the address away and start over |

## Keys

| Keys | Does |
| --- | --- |
| `Enter` | read the message |
| `Cmd+Backspace` | delete the message |
| `Cmd+R` | refresh now |

## Tests

32 checks over three files:

| File | What it pins down |
| --- | --- |
| `test/mail.test.ts` | hydra unwrapping, paging that stops, the four error kinds, and which usernames the API will take |
| `test/when.test.ts` | relative and absolute dates, pinned to a timezone so they mean the same thing on any machine |
| `test/body.test.ts` | plain text preferred, scripts and styles stripped, tables flattened, `cid:` references resolved to filenames |

The async paging checks await inside the runner. They did not at first, and
passed without asserting anything.

## Not verified

**Receiving mail.** The register, token, list and error paths were all run
against the live API. Nothing ever *arrives*, because there is no SMTP client or
relay on this machine to send a test letter from. That is the one thing this
extension exists to do, and it is unproven.
