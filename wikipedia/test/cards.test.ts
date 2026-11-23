import assert from "node:assert/strict";

import { cardToMarkdown, cut, escapeXml, imageSize, paneMarkdown, wrap } from "../src/lib/cards.ts";

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

check("a short line is left alone", () => {
	assert.equal(cut("Berlin", 20), "Berlin");
});

check("a long line is cut with an ellipsis", () => {
	assert.equal(cut("abcdef", 4), "abc…");
});

check("free text wraps on whole words and cuts the last line", () => {
	const lines = wrap("Berlin is the capital and largest city of Germany by both area and population.", 20, 2);
	assert.equal(lines.length, 2);
	assert.equal(lines[0], "Berlin is the");
	assert.ok(lines[1]?.endsWith("…"), "the rest is the article's own page");
});

check("text that fits is not cut", () => {
	assert.deepEqual(wrap("Berlin", 20, 2), ["Berlin"]);
});

check("markup characters are escaped inside the SVG", () => {
	assert.equal(escapeXml("A & B <c> \"d\""), "A &amp; B &lt;c&gt; &quot;d&quot;");
});

check("a PNG's size comes from its header", () => {
	const bytes = new Uint8Array(24);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	new DataView(bytes.buffer).setUint32(16, 640);
	new DataView(bytes.buffer).setUint32(20, 480);
	assert.deepEqual(imageSize(bytes), { width: 640, height: 480 });
});

check("a GIF's size comes from its header", () => {
	const bytes = new Uint8Array(13);
	bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
	bytes[6] = 320 & 0xff;
	bytes[7] = 320 >> 8;
	bytes[8] = 200 & 0xff;
	bytes[9] = 200 >> 8;
	assert.deepEqual(imageSize(bytes), { width: 320, height: 200 });
});

check("a JPEG's size comes from its frame header", () => {
	const bytes = new Uint8Array([
		0xff, 0xd8, // SOI
		0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
		0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, // SOF0: 480×640
		0x03, 0x00, 0x00, 0x00,
	]);
	assert.deepEqual(imageSize(bytes), { width: 640, height: 480 });
});

check("bytes that are no picture have no size", () => {
	assert.equal(imageSize(new Uint8Array([1, 2, 3, 4])), undefined);
});

check("a card's markdown carries the size query before the payload", () => {
	const markdown = cardToMarkdown("<svg>(x)</svg>");
	assert.ok(markdown.startsWith("![](data:image/svg+xml?raycast-width=420&raycast-height=200#x,"));
	const payload = markdown.slice(markdown.indexOf("#x,") + 3);
	assert.ok(!payload.includes("("), "a parenthesis would end the image early");
	assert.ok(payload.includes("%28x%29"), "the payload's own parentheses are encoded");
});

check("a pane with a picture draws the picture over the facts", () => {
	const markdown = paneMarkdown({ title: "Berlin", rows: [["Language", "English"]] }, { href: "data:image/png;base64,AA", size: { width: 64, height: 64 } });
	assert.equal(markdown.match(/!\[\]\(/g)?.length, 2);
});

check("a pane without a picture is the facts alone, not an empty card", () => {
	const markdown = paneMarkdown({ title: "Berlin", rows: [] }, { href: "" });
	assert.equal(markdown.match(/!\[\]\(/g)?.length, 1);
});
