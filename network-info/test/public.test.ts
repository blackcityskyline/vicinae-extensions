import assert from "node:assert/strict";

import { fetchPublicIp } from "../src/api/public.ts";

// The endpoints are external, so the failure paths are exercised against a
// stub: a real outage cannot be produced on demand.
type Handler = (url: string) => Response | Error;

const realFetch = globalThis.fetch;

let checks = 0;
async function check(name: string, body: () => Promise<void>) {
	globalThis.fetch = realFetch;
	try {
		await body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	} finally {
		globalThis.fetch = realFetch;
	}
}

function stub(handler: Handler) {
	globalThis.fetch = (async (input: string | URL | Request) =>
		handler(String(input))) as typeof fetch;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const IPINFO = {
	ip: "203.0.113.7",
	hostname: "example.test",
	city: "Minsk",
	region: "Minsk",
	country: "BY",
	org: "AS0000 Example",
};

async function main() {
	await check("ipinfo answers with the address and the location", async () => {
		stub((url) => {
			assert.match(url, /ipinfo\.io/);
			return json(IPINFO);
		});
		const info = await fetchPublicIp();
		assert.equal(info.status, "online");
		assert.equal(info.ip, "203.0.113.7");
		assert.equal(info.city, "Minsk");
		assert.equal(info.org, "AS0000 Example");
	});

	await check("a dead first endpoint falls through to ipify, address only", async () => {
		const seen: string[] = [];
		stub((url) => {
			seen.push(url);
			if (url.includes("ipinfo.io")) return new TypeError("fetch failed");
			if (url.includes("ipify")) return json({ ip: "203.0.113.8" });
			throw new Error(`unexpected endpoint ${url}`);
		});
		const info = await fetchPublicIp();
		assert.equal(info.status, "online");
		assert.equal(info.ip, "203.0.113.8");
		assert.equal(info.city, "");
		assert.equal(seen.length, 2);
	});

	await check("the plain-text endpoint is the last fallback", async () => {
		stub((url) => {
			if (url.includes("icanhazip")) return new Response("203.0.113.9\n", { status: 200 });
			return new TypeError("fetch failed");
		});
		const info = await fetchPublicIp();
		assert.equal(info.status, "online");
		assert.equal(info.ip, "203.0.113.9");
	});

	await check("every endpoint failing is offline, not a crash", async () => {
		stub(() => new TypeError("fetch failed"));
		const info = await fetchPublicIp();
		assert.equal(info.status, "offline");
		assert.equal(info.ip, "");
	});

	await check("a body over 16 KiB is refused, not parsed", async () => {
		stub((url) => {
			if (url.includes("icanhazip")) return new Response("203.0.113.10\n", { status: 200 });
			return new Response("x".repeat(20_000), { status: 200 });
		});
		const info = await fetchPublicIp();
		// The oversized bodies did not parse, so the last endpoint supplied it.
		assert.equal(info.ip, "203.0.113.10");
	});

	await check("a body that is not an address is refused", async () => {
		stub((url) => {
			if (url.includes("icanhazip")) return new Response("<html>blocked</html>\n", { status: 200 });
			return json({ ip: "not-an-address" });
		});
		const info = await fetchPublicIp();
		assert.equal(info.status, "offline");
		assert.equal(info.ip, "");
	});

	console.log(`${checks} checks passed`);
}

void main();
