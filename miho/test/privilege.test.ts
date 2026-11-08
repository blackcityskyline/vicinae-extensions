import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { cleanupScript, stopScript, tunStartScript } from "../src/api/mihomo.ts";

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

// The external authority for these strings is /bin/sh itself: a quoting bug or
// a missing `fi` must fail here, not as a silent half-finished TUN start.
function parse(script: string) {
	execFileSync("/bin/sh", ["-n", "-c", script], { stdio: "pipe" });
	assert.ok(script.trim().length > 0);
}

check("every root script is valid POSIX shell", () => {
	parse(cleanupScript());
	parse(stopScript([4, 5]));
	parse(stopScript([]));
	parse(tunStartScript());
});

check("a TUN start is one script: daemon, ownership, link wait and resolver", () => {
	const script = tunStartScript();
	assert.match(script, /^\/usr\/bin\/mihomo -d '\S+' -f '\S+config-tun\.yaml'/m);
	assert.match(script, /chown -R \d+:\d+ /);
	assert.match(script, /ip link show Meta/);
	assert.ok(script.includes("resolvectl dnsovertls Meta no"));
	assert.ok(script.includes("resolvectl dns Meta 198.18.0.2"));
	assert.ok(script.includes("resolvectl domain Meta '~.'"));
	assert.equal(script.match(/resolvectl flush-caches/g)?.length, 1);
	// root() adds sudo/pkexec itself; the script must not nest either.
	assert.ok(!/sudo|pkexec/.test(script));
});

check("a stop terminates every pid before it removes the links", () => {
	const script = stopScript([101, 202]);
	assert.ok(script.includes("for pid in 101 202; do kill -TERM"));
	assert.ok(script.includes("for pid in 101 202; do kill -KILL"));
	assert.ok(script.indexOf("kill -TERM") < script.indexOf("kill -KILL"));
	assert.ok(script.indexOf("kill -KILL") < script.indexOf("ip link delete dev Meta"));
	assert.ok(script.includes("ip link delete dev tun0"));
});

check("cleanup alone deletes both links and still exits zero", () => {
	const script = cleanupScript();
	assert.ok(!script.includes("kill"));
	assert.ok(script.includes("ip link delete dev Meta"));
	assert.ok(script.includes("ip link delete dev tun0"));
	assert.equal(script.trimEnd().split("\n").pop(), "true");
	assert.equal(stopScript([]), script);
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
