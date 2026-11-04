# tempmail

A temporary mailbox with a disposable address, for the signups that want one.
Make an address, watch the countdown, read the mail, copy the code out of it,
throw the whole thing away.

Two lineages meet here:

- [`Joshlucpoll/tempmail`](https://github.com/raycast/extensions/tree/main/extensions/tempmail)
  (Raycast, MIT) — the extension this directory started as, and still the shape
  of its inbox.
- [`AhmadRun/temp-mail`](https://github.com/AhmadRun/temp-mail) (an
  Omarchy/Quickshell **bar widget**, MIT) — the always-on behaviour, the
  lifetime model and the code extraction. `docs/audits/temp-mail.md` is the
  measurement of it, and every cut listed here is recorded there with its
  reason.

A bar widget has no equivalent in a launcher, so the parts that lived in the
bar became a background command: `Check For Mail` runs by itself every minute,
notifies, and deletes an address whose time is up.

## The backend is mail.tm, not mail.gw

The first upstream says `mail.gw`. Its own source already points at `mail.tm`,
and that turns out to be the right one. Measured from this machine:

| | `/domains` | register | token | `/messages` |
| --- | --- | --- | --- | --- |
| `api.mail.gw` | **502** | **502** | — | — |
| `api.mail.tm` | 200 | 201 | 200 | 200 |

Same project, same hydra API. Nothing else was a substitute: `guerrillamail`,
`disposable.de`, `1secmail`, `mailnesia` and `trashmail` all failed to answer.

The domain list changes over time — `uberip.com` in October 2026, `fldubai.com`
now — and the API rejects anything not on it, so the list is read live rather
than hardcoded. The form offers whatever `GET /domains` returns today.

## Lifetimes, not idleness

This is the widget's model, and it is stricter than the one this extension had:

- a new address lives **10 or 30 minutes**, those two and nothing else;
- `Extend by N Minutes` adds 1–30, and an address **never lives more than 60
  minutes from now**, however often you press it. The extend button buys time
  for one signup; it cannot turn a throwaway into a mailbox.
- when the lifetime runs out, the address is deleted on mail.tm and the local
  state with it, and a notification says so.

An address created before lifetimes existed has no expiry rather than an
expired one — it is left for the person holding it to throw away, not taken
back under them.

## Polling is slower than either upstream, on purpose

```
ratelimit-policy: 30; w=60
```

Thirty requests a minute, for everything. The widget polls every 5 seconds; the
Raycast extension polled faster still. Here `Check For Mail Every` defaults to
10 seconds, so an open inbox costs six a minute and there is room left to open,
read or delete something. `Never` turns the visible polling off; the background
command keeps its own once-a-minute schedule either way.

The token is cached and re-fetched only after a 401, so an action costs one
request instead of two — which is what the widget's `api()` does too, with the
same single retry. Whether `/token` draws on a budget of its own was measured
once before and answered yes (sixty back-to-back requests, all 200); today every
endpoint advertises the identical `ratelimit-policy: 30; w=60` header, including
`/token`, so that older reading is not repeated here as a fact. Caching is worth
doing either way, so nothing depends on which is true.

A 429 is reported rather than retried. Upstream sleeps a second and tries once;
in a background run that would be invisible, and in the inbox "wait a minute
and refresh" explains the empty list better than a silent second attempt that
also fails.

## What is in the UI

**The address row.** The address, a `8:42`-style countdown ticking once a
second while the panel is open, and an `N new` tag when there is unread mail.
Its actions: copy, `Extend by N Minutes`, replace with a 10- or 30-minute
address, `Choose an Address` for a name you type yourself, and `Throw Away This
Address`. Both of the actions that destroy an address confirm first and name what
they delete; deleting a single message does not, because a message is the smaller
thing.

**Getting an address when you have none.** One row per lifetime, the configured
default marked, plus the form. The default has Vicinae's "new" action on it.

**The form.** Username, domain (read from the API, so a rotating list needs no
update), and lifetime. A username is checked before it is sent — spaces and `@`
cannot make a valid address — and the API's own answer for a taken name comes
back into the field rather than a toast you miss.

**The inbox.** Sender, subject, when it arrived, a `New` tag on the unread, and
a paperclip when the message has attachments. The builtin filter runs over
sender, subject and the preview.

**A message.** Rendered as markdown, with the codes it carries as their own
rows — `Code 482910`, copy or paste, and the copy is `concealed` so the code
does not sit in the clipboard history. Codes come from mail.tm's own
`verifications` field first, then from the prose, up to three of them.
`Open HTML Version` is the escape hatch for mail the converter mangles.

**The HTML version, opened in a browser.** The message's `html` parts are
written as one document, first line a policy that makes it inert:

```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'none'; object-src 'none'; form-action 'none'">
```

so a mail cannot run, load a plugin, or submit a form on your behalf, but still
looks the way the sender meant it to — which is also the only way to see the
attachments. The page is saved under the extension's support directory, named
for the message id after that id is checked against `^[a-f0-9]{24}$`: a message
cannot choose where it is written. It goes with the address.

**`Check For Mail`.** Every minute, no window: it deletes an expired address,
warns once in the last minute, keeps the launcher row's subtitle showing time
left and unread count, and notifies about new mail.

## What the port changed, and why

**`fetch` instead of `axios`.** Node 26 has it built in.

**No `moment`.** The Raycast upstream formats every date with
`moment().humanize()` and `moment().format()`. Both follow the machine's locale,
which turns `10 Mar` into `3/10` and midnight into `12:00 AM`.
`src/utils/when.ts` builds the strings from their parts. The same note appears
in `shell-history` and `in-the-time-zone`.

**No `unique-names-generator`.** The Raycast upstream builds addresses like
`angry-purple-bear-417`. A hex string does the same job, and some signup forms
reject long addresses.

**Nothing is downloaded.** The Raycast upstream fetches every attachment and
every remote image as soon as a message opens — five attachments is five of the
thirty requests a minute, for files you may never open — and rewrites `src=` to
a `file://` path it just created. Here attachments are named, counted and sized
in the metadata, and the images a remote mail points at are not fetched:
fetching arbitrary URLs chosen by whoever sent the mail is a
fetch-on-behalf-of primitive you do not want in a launcher. The HTML version
shows everything the sender intended, in a browser that is built to load remote
content carefully. Inline images in HTML mail may not render in the markdown.

**Plain text beats HTML.** The Raycast upstream only ever reads `html[0]`, so a
mail that sends both gets its formatting mangled by an HTML-to-markdown
converter for no reason. `src/utils/body.ts` uses `text` when the sender
provided one.

**Paging stops on a short page.** The Raycast upstream recurses until its page
arithmetic happens to add up, which never finishes against a server that keeps
returning 30. Here it stops at the first short page, with a hard cap of ten
pages. The widget never pages at all — it reads page one.

**`cid:` references become names.** An inline attachment is referenced from the
HTML as `cid:ATT0001`, which means nothing outside a mail client. The Raycast
upstream rewrites it to a file it downloaded; here it becomes the attachment's
name, which needs nothing fetched, and an unnamed reference is dropped rather
than left in the text.

**The new-mail memory is persisted.** The widget keeps `knownIds` in memory, so
a shell reload re-announces the whole inbox. A background run *is* a new process
every minute, so the ids live in LocalStorage (capped at 100). The rule itself
is upstream's and survives: **the first look at an inbox never notifies**, or
every restart cries wolf about mail that arrived an hour ago.

**The notification says who, never what.** Subject lines routinely carry the
code the mail was sent to deliver, and a notification sits on screen and in the
history. Upstream's own comment says the same.

**Creating an address deletes the old one.** Both upstreams do this; here it is
in `register`, so it happens whether the address came from the row, the
replacement action or the form.

## Commands

| Command | Does |
| --- | --- |
| Open Mailbox | the address, the countdown, the inbox and the actions |
| Check For Mail | every minute, in the background: notifications, expiry, the launcher row's subtitle |
| Reset TempMail | throw the address away, with the mail in it and the saved HTML pages |

## Preferences

| Setting | Default | Does |
| --- | --- | --- |
| Address Lifetime | 10 minutes | what a new address is given; upstream offers exactly 10 and 30 |
| Extend By | 10 minutes | what `Extend by N Minutes` adds, 1–30, against the 60-minute ceiling |
| Check For Mail Every | 10 seconds | visible polling while the inbox is open; `Never` leaves only the Refresh row |
| New Mail Notifications | on | sender only, from the background command |

## Keys

One chord is set by this extension: `Cmd+Backspace` deletes the message on the
cursor, and throws the address away.

The rest are Vicinae's own context-aware actions — copy, new, open and refresh
(`Keyboard.Shortcut.Common.*` in the source) — so the chords are the launcher's
defaults, rebinding them is the launcher's settings screen, and what they
resolve to here was not verified by looking at the panel.

## Tests

62 checks over six files, none of which load `@vicinae/api`:

| File | What it pins down |
| --- | --- |
| `test/mail.test.ts` | hydra unwrapping, paging that stops, the five error kinds, which usernames the API will take, the message-id shape, the 60-minute ceiling |
| `test/when.test.ts` | relative and absolute dates pinned to a timezone, the countdown in `M:SS`, username validation |
| `test/body.test.ts` | plain text preferred, scripts and styles stripped, tables flattened, `cid:` references resolved to filenames |
| `test/codes.test.ts` | `verifications` before prose, the 40-character gap that spans a wrapped line, Arabic code-words included, three codes and no more, links and over-long runs refused |
| `test/html.test.ts` | the CSP guard is the first line, and nothing from the sender can precede it |
| `test/seen.test.ts` | the first look never notifies, the count in the title, the sender label |

The countdown and code expectations are taken from the widget's own tests
(`tests/test_temp_mail.js`), not from what this port happens to produce. The
async paging checks await inside the runner. They did not at first, and passed
without asserting anything.

## Not verified

**Receiving mail.** Register, token, list, read, mark-seen and delete were all
run against the live API. Nothing ever *arrives*: `POST /messages` answers 405
(the API cannot send), and the domain's MX host `in.mail.tm` is unreachable on
25 and 443 from this machine, which has no SMTP client either. That is the one
thing this extension exists to do, and it is unproven.

**Everything that needs a window or a desktop.** The interval command's
registration and per-minute runs are in the log, but the notifications, the
subtitle `updateCommandMetadata` writes from a background worker, the browser
handoff for a saved HTML page, and the rendered lists themselves were not seen.
