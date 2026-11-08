import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	addSubscription,
	readSubscriptions,
	removeSubscription,
	setSubscription,
} from "../src/utils/subscriptions.ts";

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

const CONFIG = `mixed-port: 7890

proxy-providers:
  vless:
    type: http
    url: "https://example.com/sub"
    path: ./providers/vless.yaml
    interval: 3600
    health-check:
      enable: true
      interval: 60

# ------------------------------------------
# Proxy groups
# ------------------------------------------
proxy-groups:
  - name: "AUTO"
    type: url-test
    use:
      - vless
  - name: "SELECT"
    type: select
    use:
      - vless

rules:
  - MATCH,SELECT
`;

check("the existing provider is read with its url and interval", () => {
	assert.deepEqual(readSubscriptions(CONFIG), [
		{ name: "vless", url: "https://example.com/sub", interval: 3600 },
	]);
	assert.deepEqual(readSubscriptions("mixed-port: 7890\n"), []);
});

check("a new provider joins the section and every group that has a use list", () => {
	const next = addSubscription(CONFIG, { name: "backup", url: "https://example.net/b", interval: 7200 });
	assert.deepEqual(readSubscriptions(next), [
		{ name: "backup", url: "https://example.net/b", interval: 7200 },
		{ name: "vless", url: "https://example.com/sub", interval: 3600 },
	]);
	assert.equal(next.match(/^ {6}- backup$/gm)?.length, 2);
	assert.equal(next.match(/^ {6}- vless$/gm)?.length, 2);
	assert.ok(next.includes("# Proxy groups\n# ------------------------------------------\nproxy-groups:"));
});

check("adding then removing a provider restores the file", () => {
	const sub = { name: "backup", url: "https://example.net/b", interval: 60 };
	assert.equal(removeSubscription(addSubscription(CONFIG, sub), sub.name), CONFIG);
});

check("the new provider carries a path and a health check", () => {
	const next = addSubscription(CONFIG, { name: "backup", url: "https://example.net/b", interval: 0 });
	assert.ok(next.includes("    path: ./providers/backup.yaml\n"));
	assert.ok(next.includes("      expected-status: 204\n"));
	assert.ok(next.includes("    interval: 0\n"));
});

check("a duplicate provider is refused", () => {
	assert.throws(() => addSubscription(CONFIG, { name: "vless", url: "https://example.net/b", interval: 60 }));
});

check("names, urls and intervals are validated", () => {
	assert.throws(() => addSubscription(CONFIG, { name: "Bad Name", url: "https://example.net", interval: 60 }));
	assert.throws(() => addSubscription(CONFIG, { name: "ok", url: "ftp://example.net", interval: 60 }));
	assert.throws(() => addSubscription(CONFIG, { name: "ok", url: "not a url", interval: 60 }));
	assert.throws(() => addSubscription(CONFIG, { name: "ok", url: "https://example.net", interval: -1 }));
});

check("editing a provider keeps the rest of its block", () => {
	const next = setSubscription(CONFIG, "vless", { url: "https://example.org/new", interval: 600 });
	assert.deepEqual(readSubscriptions(next), [
		{ name: "vless", url: "https://example.org/new", interval: 600 },
	]);
	assert.ok(next.includes("    path: ./providers/vless.yaml\n"));
	assert.ok(next.includes("      interval: 60\n"));
	assert.throws(() => setSubscription(CONFIG, "missing", { url: "https://example.net", interval: 60 }));
});

check("removing a provider drops its block and its group references", () => {
	const two = addSubscription(CONFIG, { name: "backup", url: "https://example.net/b", interval: 60 });
	const next = removeSubscription(two, "backup");
	assert.deepEqual(readSubscriptions(next), [{ name: "vless", url: "https://example.com/sub", interval: 3600 }]);
	assert.ok(!next.includes("backup"));
	assert.equal(next.match(/^ {6}- vless$/gm)?.length, 2);
	assert.throws(() => removeSubscription(two, "missing"));
});

check("a config without a provider section gains one", () => {
	const next = addSubscription("mixed-port: 7890\n", { name: "fresh", url: "https://example.net", interval: 60 });
	assert.deepEqual(readSubscriptions(next), [{ name: "fresh", url: "https://example.net", interval: 60 }]);
	assert.ok(next.startsWith("mixed-port: 7890\n\nproxy-providers:\n  fresh:\n"));
});

check("mihomo accepts the edited config", () => {
	if (!existsSync("/usr/bin/mihomo")) {
		console.log("     skipped: /usr/bin/mihomo is absent");
		return;
	}
	const dir = mkdtempSync(join(tmpdir(), "miho-sub-"));
	try {
		const next = addSubscription(CONFIG, { name: "backup", url: "https://example.net/b", interval: 60 });
		const file = join(dir, "config.yaml");
		writeFileSync(file, next);
		const result = spawnSync("/usr/bin/mihomo", ["-t", "-d", dir, "-f", file], { encoding: "utf8", timeout: 30_000 });
		assert.equal(result.status, 0, result.stderr || result.stdout);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
