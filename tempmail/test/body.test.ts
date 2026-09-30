import assert from "node:assert/strict";

import { toMarkdown, type MailMessage } from "../src/utils/body.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: "m1",
    subject: "Your code",
    from: { name: "Example", address: "no-reply@example.test" },
    createdAt: "2026-03-10T04:59:12Z",
    retentionDate: "2026-03-11T04:59:12Z",
    downloadUrl: "/messages/m1/download",
    size: 1024,
    seen: false,
    attachments: [],
    ...overrides,
  } as MailMessage;
}

const HTML = `<html><head><style>.x{color:red}</style></head><body>
<div><h1>Your code</h1><p>Hello <b>there</b>, the code is <span>482913</span>.</p>
<table><tr><td>left</td><td>right</td></tr></table>
<a href="https://example.test/a?b=1&amp;c=2">click me</a>
<script>alert(1)</script></div></body></html>`;

check("the subject becomes the heading", () => {
  assert.match(toMarkdown(message({ html: [HTML] })), /^# Your code/);
});

check("a body with no subject still renders", () => {
  const markdown = toMarkdown(message({ subject: "", html: [HTML] }));
  assert.ok(markdown.length > 0);
  assert.ok(!/^#\s*$/m.test(markdown), "an empty heading was emitted");
});

check("plain text is preferred over html when the message has both", () => {
  // Upstream only ever reads html. A text body needs no conversion at all, so
  // going through a converter only loses paragraphs and mangles text.
  const markdown = toMarkdown(message({ text: "First line.\n\nSecond paragraph.", html: [HTML] }));
  assert.match(markdown, /First line\./);
  assert.match(markdown, /Second paragraph\./);
  assert.ok(!markdown.includes("click me"), "html leaked in while a text body was available");
});

check("paragraphs in a plain text body stay paragraphs", () => {
  const markdown = toMarkdown(message({ text: "One.\n\nTwo.\n\nThree." }));
  assert.match(markdown, /One\.\n\nTwo\.\n\nThree\./);
});

check("html is converted when there is no text body", () => {
  const markdown = toMarkdown(message({ html: [HTML] }));
  assert.match(markdown, /482913/);
  assert.match(markdown, /\[click me\]\(https:\/\/example\.test\/a\?b=1&c=2\)/);
  assert.ok(!markdown.includes("alert(1)"), "a script survived into the body");
  assert.ok(!/color:red|\.x\{/.test(markdown), "a stylesheet survived into the body");
});

check("tables do not become markdown tables", () => {
  // The renderer mangles wide tables, so they are flattened the way upstream
  // does it. What matters is that the cell text is still there.
  const markdown = toMarkdown(message({ html: [HTML] }));
  assert.ok(!/\|\s*-{2,}/.test(markdown), `a markdown table was produced:\n${markdown}`);
  assert.match(markdown, /left/);
  assert.match(markdown, /right/);
});

check("an inline attachment becomes its filename, not a dead cid:", () => {
  const markdown = toMarkdown(
    message({
      html: ['<p>see <img src="cid:ATT0001"> attached</p>'],
      attachments: [
        { id: "ATT0001", filename: "receipt.png", contentType: "image/png", size: 10, downloadUrl: "/a" },
      ],
    }),
  );
  assert.match(markdown, /receipt\.png/);
  assert.ok(!markdown.includes("cid:"), `a cid: reference survived:\n${markdown}`);
});

check("an inline attachment nobody can name is dropped, not left as garbage", () => {
  const markdown = toMarkdown(message({ html: ['<p>see <img src="cid:ATT9999"> attached</p>'] }));
  assert.match(markdown, /see/);
  assert.match(markdown, /attached/);
  assert.ok(!markdown.includes("ATT9999"), `a dangling cid: survived:\n${markdown}`);
});

check("a filename with spaces and brackets does not break the output", () => {
  const markdown = toMarkdown(
    message({
      html: ['<p><img src="cid:ATT0002"></p>'],
      attachments: [
        { id: "ATT0002", filename: "my (report) [final].pdf", contentType: "application/pdf", size: 10, downloadUrl: "/b" },
      ],
    }),
  );
  assert.match(markdown, /my \(report\) \[final\]\.pdf/);
});

check("an empty body says so rather than showing nothing", () => {
  const markdown = toMarkdown(message({ text: "", html: [] }));
  assert.match(markdown, /no body|empty/i);
});

check("a whitespace-only body counts as empty", () => {
  assert.match(toMarkdown(message({ text: "   \n  ", html: [] })), /no body|empty/i);
});

check("a message with neither text nor html does not throw", () => {
  assert.doesNotThrow(() => toMarkdown(message({ text: undefined, html: undefined })));
});
