import assert from "node:assert/strict";

import { firstWifiDevice, hotspotArgs } from "../src/utils/hotspot.ts";

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

check("a hotspot command carries the ssid and the password", () => {
  assert.deepEqual(hotspotArgs({ ssid: "home", password: "12345678" }), [
    "device",
    "wifi",
    "hotspot",
    "ssid",
    "home",
    "password",
    "12345678",
  ]);
});

check("the device and the band are added when known", () => {
  assert.deepEqual(hotspotArgs({ ssid: "home", password: "12345678", device: "wlp3s0", band: "a" }), [
    "device",
    "wifi",
    "hotspot",
    "ifname",
    "wlp3s0",
    "ssid",
    "home",
    "password",
    "12345678",
    "band",
    "a",
  ]);
});

check("a network name is trimmed and must fit 32 characters", () => {
  assert.equal(hotspotArgs({ ssid: "  home  ", password: "12345678" })[4], "home");
  assert.throws(() => hotspotArgs({ ssid: "   ", password: "12345678" }));
  assert.throws(() => hotspotArgs({ ssid: "x".repeat(33), password: "12345678" }));
  assert.equal(hotspotArgs({ ssid: "x".repeat(32), password: "12345678" })[4]?.length, 32);
});

check("the password is 8 to 63 characters and rejects control characters", () => {
  assert.throws(() => hotspotArgs({ ssid: "home", password: "1234567" }));
  assert.throws(() => hotspotArgs({ ssid: "home", password: "x".repeat(64) }));
  assert.throws(() => hotspotArgs({ ssid: "home", password: "12345678\n" }));
  assert.throws(() => hotspotArgs({ ssid: "ho\nme", password: "12345678" }));
});

check("shell syntax in a password stays data", () => {
  const args = hotspotArgs({ ssid: "home", password: '$(touch /tmp/pwned) "quoted"' });
  assert.equal(args[args.length - 1], '$(touch /tmp/pwned) "quoted"');
});

check("the first wifi device is picked out of the device status", () => {
  assert.equal(firstWifiDevice("wlp3s0:wifi:connected\nlo:loopback:connected"), "wlp3s0");
  assert.equal(firstWifiDevice("enp4s0f2:ethernet:unavailable\n"), null);
  assert.equal(firstWifiDevice("p2p-dev-wlp3s0:wifi-p2p:disconnected"), null);
  assert.equal(firstWifiDevice(""), null);
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
