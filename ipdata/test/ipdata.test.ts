import assert from "node:assert/strict";

import {
  clean,
  extract,
  hostnameFrom,
  isValid,
  maskIp,
  parseTarget,
  reservedLabel,
  version,
  v6Groups,
} from "../src/lib/ip.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

check("version separates IPv4, IPv6 and neither", () => {
  assert.equal(version("8.8.8.8"), 4);
  assert.equal(version("2001:db8::1"), 6);
  assert.equal(version("::1"), 6);
  assert.equal(version("256.1.1.1"), 0);
  assert.equal(version("example.com"), 0);
});

check("clean strips ports, CIDR, brackets and punctuation", () => {
  // RFC 5737 documentation addresses keep the shape, only the wrapper goes.
  assert.equal(clean("1.2.3.4:8080"), "1.2.3.4");
  assert.equal(clean("1.2.3.4/24"), "1.2.3.4");
  assert.equal(clean("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(clean("8.8.8.8,"), "8.8.8.8");
  assert.equal(clean("https://8.8.8.8/path"), "8.8.8.8");
  assert.equal(clean("fe80::1%eth0"), "fe80::1");
  assert.equal(clean("::"), null);
  assert.equal(clean("not-an-ip"), null);
});

check("extract finds the address inside prose", () => {
  assert.equal(extract("client 8.8.8.8 connected"), "8.8.8.8");
  assert.equal(extract("src=192.168.1.10 dst"), "192.168.1.10");
  assert.equal(extract("from [2001:db8::1]:443"), "2001:db8::1");
  assert.equal(extract("no address here"), null);
  assert.equal(extract(""), null);
  assert.equal(extract(null), null);
});

check("v6Groups expands compressed and IPv4-mapped forms", () => {
  assert.deepEqual(v6Groups("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(v6Groups("2001:db8::1"), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(v6Groups("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
  assert.equal(v6Groups("1:2:3"), null);
});

check("reservedLabel matches the RFC ranges", () => {
  assert.match(reservedLabel("10.1.2.3") ?? "", /RFC 1918/);
  assert.match(reservedLabel("172.16.0.1") ?? "", /RFC 1918/);
  assert.match(reservedLabel("192.168.1.1") ?? "", /RFC 1918/);
  assert.match(reservedLabel("127.0.0.1") ?? "", /Loopback/);
  assert.match(reservedLabel("169.254.10.1") ?? "", /Link-local/);
  assert.match(reservedLabel("100.64.0.1") ?? "", /Carrier-grade/);
  assert.match(reservedLabel("203.0.113.5") ?? "", /Documentation/);
  assert.match(reservedLabel("224.0.0.1") ?? "", /Multicast/);
  assert.match(reservedLabel("2001:db8::5") ?? "", /Documentation/);
  assert.match(reservedLabel("fe80::1") ?? "", /Link-local/);
  assert.match(reservedLabel("fc00::1") ?? "", /Unique local/);
  // Public addresses and the top of RFC 1918's neighbours are not reserved.
  assert.equal(reservedLabel("8.8.8.8"), null);
  assert.equal(reservedLabel("172.32.0.1"), null);
  assert.equal(reservedLabel("2606:4700::1111"), null);
});

check("maskIp keeps the /24 and /48 routing prefix", () => {
  assert.equal(maskIp("203.0.113.45"), "203.0.113.x");
  assert.equal(maskIp("2001:db8:85a3:1:2:3:4:5"), "2001:db8:85a3:x:x:x:x:x");
  assert.equal(maskIp("garbage"), "garbage");
});

check("hostnameFrom accepts bare hostnames and rejects addresses", () => {
  assert.equal(hostnameFrom("example.com"), "example.com");
  assert.equal(hostnameFrom("https://Example.COM/path"), "example.com");
  assert.equal(hostnameFrom("user@host.example.org:443"), "host.example.org");
  assert.equal(hostnameFrom("8.8.8.8"), null);
  assert.equal(hostnameFrom("localhost"), null);
});

check("parseTarget routes typed input to ip, host, invalid or empty", () => {
  assert.deepEqual(parseTarget("8.8.8.8"), { kind: "ip", ip: "8.8.8.8" });
  assert.deepEqual(parseTarget("example.com"), { kind: "host", host: "example.com" });
  assert.deepEqual(parseTarget("???"), { kind: "invalid" });
  assert.deepEqual(parseTarget("   "), { kind: "empty" });
});

check("isValid agrees with version", () => {
  assert.equal(isValid("8.8.8.8"), true);
  assert.equal(isValid("::1"), true);
  assert.equal(isValid("999.999.999.999"), false);
});

console.log(failed === 0 ? `\n${passed} checks passed` : `\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
