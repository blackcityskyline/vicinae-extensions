import assert from "node:assert/strict";

import {
  parseCurrentConnection,
  parseSavedConnections,
  parseWifiDevice,
  parseWifiList,
  sortNetworks,
  type WifiNetwork,
} from "../src/utils/wifi-helpers-nmcli.ts";

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

// Samples in the fixed-width formats the parsers are written against.
check("nmcli device wifi list: in-use first line is parsed", () => {
  const networks = parseWifiList(
    "IN-USE  BSSID              SSID           MODE   CHAN  RATE        SIGNAL  BARS  SECURITY\n" +
      "*       AA:BB:CC:DD:EE:FF  MyWiFi         Infra  6     54 Mbit/s   67      ▂▄▆_  WPA2\n" +
      "        11:22:33:44:55:66  OtherNet       Infra  11    54 Mbit/s   42      ▄___  WPA2\n",
  );

  assert.deepEqual(networks, [
    {
      inUse: true,
      bssid: "AA:BB:CC:DD:EE:FF",
      ssid: "MyWiFi",
      mode: "Infra",
      channel: 6,
      rate: "54 Mbit/s",
      signal: 67,
      bars: "▂▄▆_",
      security: "WPA2",
    },
    {
      inUse: false,
      bssid: "11:22:33:44:55:66",
      ssid: "OtherNet",
      mode: "Infra",
      channel: 11,
      rate: "54 Mbit/s",
      signal: 42,
      bars: "▄___",
      security: "WPA2",
    },
  ]);
});

check("nmcli device wifi list: short output is empty", () => {
  assert.deepEqual(parseWifiList("IN-USE  BSSID"), []);
});

check("nmcli connection show: wifi connections parse, non-wifi is dropped", () => {
  const saved = parseSavedConnections(
    "NAME               UUID                                 TYPE   DEVICE  STATE        TIMESTAMP\n" +
      "MyWiFi             11111111-2222-3333-4444-555555555555  wifi   wlp3s0  activated    1700000000\n" +
      "BackupNet          22222222-3333-4444-5555-666666666666  wifi   --      unavailable  0\n" +
      "EthBridge          33333333-4444-5555-6666-777777777777  ethernet  eth0  activated    100\n",
  );

  assert.deepEqual(saved, [
    {
      name: "MyWiFi",
      uuid: "11111111-2222-3333-4444-555555555555",
      type: "wifi",
      device: "wlp3s0",
      state: "activated",
      timestamp: 1700000000,
    },
    {
      name: "BackupNet",
      uuid: "22222222-3333-4444-5555-666666666666",
      type: "wifi",
      device: "--",
      state: "unavailable",
      timestamp: 0,
    },
  ]);
});

check("nmcli device status: the wifi line yields the device", () => {
  assert.deepEqual(
    parseWifiDevice("DEVICE   TYPE   STATE     CONNECTION\nwlp3s0   wifi   connected   MyWiFi"),
    { name: "wlp3s0", type: "wifi", state: "connected", connection: "MyWiFi" },
  );
  assert.equal(parseWifiDevice("DEVICE   TYPE   STATE\nwlp3s0   ethernet   connected"), null);
});

check("nmcli connection show --active: the in-use network is current", () => {
  assert.deepEqual(
    parseCurrentConnection("NAME     UUID                                 TYPE   DEVICE  STATE\nMyWiFi   11111111-2222-3333-4444-555555555555  wifi   wlp3s0  activated"),
    { name: "MyWiFi", device: "wlp3s0" },
  );
  assert.equal(parseCurrentConnection("NAME   UUID"), null);
});

check("sortNetworks: connected networks first", () => {
  const idle = { inUse: false, ssid: "idle", bssid: "", mode: "", channel: 0, rate: "", signal: 0, bars: "", security: "" };
  const active = { inUse: true, ssid: "active", bssid: "", mode: "", channel: 0, rate: "", signal: 0, bars: "", security: "" };
  assert.deepEqual(sortNetworks([idle, active]), [active, idle]);
  assert.deepEqual(sortNetworks([idle]), [idle] as WifiNetwork[]);
});

console.log(`\n${checks} checks`);
