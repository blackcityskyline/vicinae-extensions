import assert from "node:assert/strict";
import type { NetworkInterfaceInfo } from "node:os";
import { pickSelectedInterface, rankInterfaces } from "../src/utils/network.ts";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function info(address: string, family: "IPv4" | "IPv6" = "IPv4", internal = false): NetworkInterfaceInfo {
  return { address, family, internal } as NetworkInterfaceInfo;
}

// Names are the ones Linux gives these devices: lo, docker0 and br-<id> from Docker, virbr0 from libvirt,
// veth* from containers, wlp3s0 and enp4s0 from systemd's predictable naming.
const host: Record<string, NetworkInterfaceInfo[]> = {
  lo: [info("127.0.0.1", "IPv4", true)],
  "br-1a2b3c4d5e6f": [info("172.18.0.1")],
  docker0: [info("172.17.0.1")],
  enp4s0: [info("fe80::1", "IPv6"), info("192.168.1.21")],
  veth9f8e7d: [info("fe80::2", "IPv6")],
  virbr0: [info("192.168.122.1")],
  wlp3s0: [info("192.168.1.20")],
};

check("loopback and interfaces without an IPv4 address are not candidates", () => {
  const names = rankInterfaces(host).map((item) => item.name);
  assert.ok(!names.includes("lo"));
  assert.ok(!names.includes("veth9f8e7d"));
});

check("real network cards come before docker, bridge and libvirt devices", () => {
  assert.deepEqual(
    rankInterfaces(host).map((item) => item.name),
    ["enp4s0", "wlp3s0", "br-1a2b3c4d5e6f", "docker0", "virbr0"],
  );
});

check("the default pick is a real network card, not the alphabetically first device", () => {
  assert.equal(pickSelectedInterface(undefined, rankInterfaces(host)), "192.168.1.21");
});

check("a saved choice is kept even when it is a bridge", () => {
  assert.equal(pickSelectedInterface("172.17.0.1", rankInterfaces(host)), "172.17.0.1");
});

check("a saved choice that no longer exists falls back to the first candidate", () => {
  assert.equal(pickSelectedInterface("10.9.9.9", rankInterfaces(host)), "192.168.1.21");
});

check("no candidates gives an empty address", () => {
  assert.equal(pickSelectedInterface(undefined, rankInterfaces({ lo: [info("127.0.0.1", "IPv4", true)] })), "");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
