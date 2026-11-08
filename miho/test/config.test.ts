import assert from "node:assert/strict";

import {
	buildTunConfig,
	parseModeFromCmdline,
	parseRouteMode,
	readRouting,
	setRouting,
	sortNodes,
} from "../src/utils/config.ts";

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

// The tail of the real ~/.config/mihomo/config.yaml on 2026-11-08: the four
// private ranges, GEOIP,CN and the rule the script toggles.
const CONFIG = `mixed-port: 7890
external-controller: 127.0.0.1:7891
allow-lan: false
mode: rule
log-level: info
ipv6: false

rules:
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
`;

check("a running daemon is classified by the config it was started with", () => {
	assert.equal(
		parseModeFromCmdline(
			"/usr/bin/mihomo\0-d\0/home/black/.config/mihomo\0-f\0/home/black/.config/mihomo/config.yaml\0",
		),
		"proxy",
	);
	assert.equal(
		parseModeFromCmdline(
			"/usr/bin/mihomo -d /home/black/.config/mihomo -f /home/black/.config/mihomo/config-tun.yaml",
		),
		"tun",
	);
	assert.equal(parseModeFromCmdline("/usr/bin/mihomo\0-d\0/home/black/.config/mihomo\0--config\0config-tun.yaml\0"), "tun");
});

check("a command line naming another config does not guess a mode", () => {
	assert.equal(parseModeFromCmdline(""), null);
	assert.equal(parseModeFromCmdline("/usr/bin/mihomo -d /tmp -f /tmp/other.yaml"), null);
	assert.equal(parseModeFromCmdline("/usr/bin/mihomo -f"), null);
});

check("routing reads the MATCH rule, not the CIDR rules", () => {
	assert.equal(readRouting(CONFIG), "proxy");
	assert.equal(readRouting(setRouting(CONFIG, "direct")), "direct");
	assert.equal(readRouting("rules:\n  - GEOIP,CN,DIRECT\n"), "unknown");
});

check("routing replaces the whole block only once and round-trips", () => {
	const direct = setRouting(CONFIG, "direct");
	assert.equal(direct.match(/MATCH,(PROXY|DIRECT)/g)?.length, 1);
	assert.ok(direct.includes("  - MATCH,DIRECT\n"));
	assert.ok(direct.includes("  - IP-CIDR,10.0.0.0/8,DIRECT\n"));
	assert.equal(setRouting(direct, "proxy"), CONFIG);
});

check("routing refuses a config without the rule instead of silently doing nothing", () => {
	assert.throws(() => setRouting("rules:\n  - GEOIP,CN,DIRECT\n", "proxy"), /has no MATCH rule/);
});

check("the TUN copy keeps the rules and gains exactly one tun block", () => {
	const tun = buildTunConfig(CONFIG);
	assert.equal(tun.match(/^tun:/gm)?.length, 1);
	assert.ok(tun.includes("  - MATCH,PROXY\n"));
	assert.ok(tun.includes("  device: Meta\n"));
	assert.ok(tun.includes("  stack: mixed\n"));
	assert.ok(tun.includes("    - tcp://any:53\n"));
	assert.ok(!tun.startsWith("\n"));
});

check("regenerating from an already generated copy does not stack blocks", () => {
	const once = buildTunConfig(CONFIG);
	const twice = buildTunConfig(once);
	assert.equal(twice.match(/^tun:/gm)?.length, 1);
	assert.equal(twice, once);
});

check("the TUN copy carries the current routing choice", () => {
	const tun = buildTunConfig(setRouting(CONFIG, "direct"));
	assert.ok(tun.includes("  - MATCH,DIRECT\n"));
	assert.ok(!tun.includes("MATCH,PROXY"));
});

check("nodes without a delay sort last", () => {
	const nodes = ["slow", "unanswered", "fast", "medium"];
	const sorted = sortNodes(nodes, { slow: 559, fast: 184, medium: 303 });
	assert.deepEqual(sorted, ["fast", "medium", "slow", "unanswered"]);
	assert.deepEqual(sortNodes([], {}), []);
});

check("a failed health check is not the fastest node", () => {
	assert.deepEqual(sortNodes(["dead", "fast"], { dead: 0, fast: 200 }), ["fast", "dead"]);
	assert.deepEqual(sortNodes(["a", "b"], { a: 0, b: 0 }), ["a", "b"]);
});

check("an unknown route mode falls back to rule", () => {
	assert.equal(parseRouteMode("rule"), "rule");
	assert.equal(parseRouteMode("global"), "global");
	assert.equal(parseRouteMode("direct"), "direct");
	assert.equal(parseRouteMode("nonsense"), "rule");
	assert.equal(parseRouteMode(undefined), "rule");
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
