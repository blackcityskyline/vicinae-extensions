import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	parseIwLink,
	parsePingMs,
	parseProcNetDev,
	parseResolvectlDns,
	parseSockets,
} from "../src/utils/parse.ts";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

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

check("the primary interface's counters are read from the real /proc/net/dev", () => {
	const sample = parseProcNetDev(fixture("proc-net-dev.txt"), "primary", "wlp3s0");
	assert.ok(sample);
	assert.equal(sample.rx, 4626782794);
	assert.equal(sample.tx, 433061626);
	assert.equal(sample.iface, "wlp3s0");
	assert.deepEqual(sample.interfaces.enp4s0f2, { rx: 0, tx: 0 });
	assert.equal(sample.interfaces.lo, undefined);
});

check("rx is field 0 and tx is field 8, not its neighbour", () => {
	// net/core/net-procfs.c prints sixteen counters per line: eight receive,
	// then eight transmit. Every field here is distinct so an off-by-one in
	// either direction fails.
	const text = [
		"Inter-|   Receive                                                |  Transmit",
		" face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
		"  eth0: 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115",
	].join("\n");
	const sample = parseProcNetDev(text, "primary", "eth0");
	assert.ok(sample);
	assert.equal(sample.rx, 100);
	assert.equal(sample.tx, 108);
});

check("the all scope sums physical interfaces and skips virtual ones", () => {
	const text = [
		"header",
		"header",
		"  eth0: 10 0 0 0 0 0 0 0 20 0 0 0 0 0 0 0",
		" wlan0: 30 0 0 0 0 0 0 0 40 0 0 0 0 0 0 0",
		"docker0: 50 0 0 0 0 0 0 0 60 0 0 0 0 0 0 0",
		"veth12ab: 70 0 0 0 0 0 0 0 80 0 0 0 0 0 0 0",
		"   wg0: 90 0 0 0 0 0 0 0 95 0 0 0 0 0 0 0",
		"    lo: 99 0 0 0 0 0 0 0 99 0 0 0 0 0 0 0",
	].join("\n");
	const sample = parseProcNetDev(text, "all", "eth0");
	assert.ok(sample);
	assert.equal(sample.rx, 40);
	assert.equal(sample.tx, 60);
	assert.equal(sample.iface, "all");
	// Virtual counters are still reported per interface, just not summed.
	assert.deepEqual(sample.interfaces.docker0, { rx: 50, tx: 60 });
});

check("a virtual primary interface is still measured", () => {
	// A VPN as the default route is the point of the primary scope; the
	// virtual-interface filter applies to the sum, not to the chosen face.
	const text = [
		"header",
		"header",
		"  wg0: 90 0 0 0 0 0 0 0 95 0 0 0 0 0 0 0",
	].join("\n");
	const sample = parseProcNetDev(text, "primary", "wg0");
	assert.ok(sample);
	assert.equal(sample.rx, 90);
	assert.equal(sample.tx, 95);
});

check("an unknown primary face falls back to the sum", () => {
	const sample = parseProcNetDev(fixture("proc-net-dev.txt"), "primary", "ppp0");
	assert.ok(sample);
	assert.equal(sample.iface, "ppp0");
	assert.equal(sample.rx, 4626782794);
});

check("no counters at all is no sample", () => {
	assert.equal(parseProcNetDev("", "primary", "eth0"), null);
	assert.equal(parseProcNetDev("header\nheader\n", "all", "eth0"), null);
});

check("established sockets are grouped per app from the real ss layout", () => {
	// `ss -tinp state established` prints no State column: five fields, then
	// an indented TCP-info line. Upstream's parser required six fields and
	// returned [] for this exact shape (docs/audits/network-info.md).
	const apps = parseSockets(fixture("ss-established.txt"));
	assert.deepEqual(
		apps.map((a) => a.name),
		["chat", "editor", "browser"],
	);
	const chat = apps[0];
	assert.ok(chat);
	assert.equal(chat.conns, 3);
	assert.equal(chat.bytesSent, 4915733 + 1814);
	assert.equal(chat.bytesReceived, 2776268 + 6992);
	assert.deepEqual(chat.peers, ["203.0.113.33", "203.0.113.34"]);
});

check("a socket without a TCP-info line still counts as a connection", () => {
	const apps = parseSockets(fixture("ss-established.txt"));
	const chat = apps.find((a) => a.name === "chat");
	assert.ok(chat);
	assert.equal(chat.conns, 3);
});

check("loopback peers are not internet traffic, in any of their three spellings", () => {
	const apps = parseSockets(fixture("ss-established.txt"));
	assert.equal(apps.find((a) => a.name === "player"), undefined);
	const editor = apps.find((a) => a.name === "editor");
	assert.ok(editor);
	assert.equal(editor.conns, 2);
	assert.deepEqual(editor.peers, ["198.51.100.9"]);
});

check("a socket with no process owner is not attributed to anyone", () => {
	const apps = parseSockets(fixture("ss-established.txt"));
	const total = apps.reduce((n, a) => n + a.conns, 0);
	assert.equal(total, 8);
});

check("peers are deduplicated and capped at three", () => {
	const lines = ["a", "b", "c", "d"]
		.map(
			(host, i) =>
				`0 0 192.168.1.5:4000${i} 203.0.113.${i + 1}:443 users:(("app",pid=1,fd=${i}))\n\t cubic bytes_sent:1 bytes_received:1`,
		)
		.join("\n");
	const apps = parseSockets(lines);
	assert.equal(apps.length, 1);
	assert.ok(apps[0]);
	assert.equal(apps[0].conns, 4);
	assert.deepEqual(apps[0].peers, ["203.0.113.1", "203.0.113.2", "203.0.113.3"]);
});

check("apps are ordered by bytes moved, then connections, then name", () => {
	const text = [
		'0 0 192.168.1.5:1 203.0.113.1:443 users:(("quiet",pid=1,fd=1))',
		"\t cubic bytes_sent:1 bytes_received:1",
		'0 0 192.168.1.5:2 203.0.113.2:443 users:(("busy",pid=2,fd=1))',
		"\t cubic bytes_sent:500 bytes_received:500",
		'0 0 192.168.1.5:3 203.0.113.3:443 users:(("also",pid=3,fd=1))',
		"\t cubic bytes_sent:500 bytes_received:500",
	].join("\n");
	assert.deepEqual(
		parseSockets(text).map((a) => a.name),
		["also", "busy", "quiet"],
	);
});

check("iw reports the SSID, signal, frequency and both bitrates", () => {
	const link = parseIwLink(fixture("iw-link.txt"));
	assert.ok(link);
	assert.equal(link.ssid, "TestNet");
	assert.equal(link.signalDbm, -29);
	assert.equal(link.freqMhz, 2442);
	assert.equal(link.rxBitrate, "150.0 MBit/s MCS 7 40MHz short GI");
	assert.equal(link.txBitrate, "150.0 MBit/s MCS 7 40MHz short GI");
});

check("a disconnected wireless interface is no link", () => {
	assert.equal(parseIwLink("Not connected."), null);
	assert.equal(parseIwLink(""), null);
});

check("DNS servers are deduplicated across links and sorted", () => {
	assert.deepEqual(parseResolvectlDns(fixture("resolvectl-dns.txt")), [
		"1.0.0.1",
		"1.1.1.1",
		"8.8.8.8",
	]);
});

check("scoped and link-local DNS tokens are dropped, global IPv6 kept", () => {
	const text = [
		"Global: 2001:4860:4860::8888",
		"Link 4 (wg0): 10.0.0.1#53 fd00::1 fe80::1 10.0.0.2%wg0",
		"Link 2 (eth0):",
	].join("\n");
	assert.deepEqual(parseResolvectlDns(text), ["10.0.0.1", "10.0.0.2", "2001:4860:4860::8888"]);
});

check("gateway latency comes from the reply, not the statistics line", () => {
	assert.equal(parsePingMs(fixture("ping.txt")), 1.1);
});

check("a lost probe is no latency", () => {
	assert.equal(parsePingMs("1 packets transmitted, 0 received, 100% packet loss"), null);
	assert.equal(parsePingMs(""), null);
});

console.log(`${checks} checks passed`);