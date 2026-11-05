import assert from "node:assert/strict";

import { BATTERY_IFACE, DEVICE_IFACE, findBatteryPath } from "../src/bluez/types.ts";

/**
 * `findBatteryPath` decides which D-Bus object to ask for `Percentage`, so it is
 * checked against the shapes BlueZ actually exports. Only the interface name is
 * looked at, never a value: measured against the live bus, `GetManagedObjects`
 * hands back every property as a Variant (`{signature: "b", value: true}`), and
 * reading it is `getAllProperties`' job, which unwraps.
 */
const devicePath = "/org/bluez/hci0/dev_1C_52_16_B4_7F_F7";

const battery = { [BATTERY_IFACE]: { Percentage: 70 } };
const device = { [DEVICE_IFACE]: { Address: devicePath.slice(-17).replace(/_/g, ":") } };

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

check("a battery exported on the device object is that object", () => {
	// The documented case (doc/org.bluez.Battery.rst): the GATT Battery Service
	// plugin registers Battery1 on the device object itself.
	assert.equal(
		findBatteryPath(
			{ [devicePath]: { ...device, ...battery } },
			devicePath,
		),
		devicePath,
	);
});

check("a battery exported below the device is found", () => {
	// The provider case, and the one the old code missed: src/battery.c puts a
	// battery whose provider names an Identifier at <device>/battery_<id>.
	const child = `${devicePath}/battery_headset`;
	assert.equal(
		findBatteryPath({ [devicePath]: device, [child]: battery }, devicePath),
		child,
	);
});

check("a device object is preferred over a child", () => {
	// Both can be registered; picking one of them at random would make the
	// reading change between refreshes.
	const child = `${devicePath}/battery_headset`;
	assert.equal(
		findBatteryPath(
			{ [child]: battery, [devicePath]: { ...device, ...battery } },
			devicePath,
		),
		devicePath,
	);
});

check("another device's battery is not read for this one", () => {
	const other = "/org/bluez/hci0/dev_77_BC_9C_80_00_2C";
	assert.equal(
		findBatteryPath(
			{ [devicePath]: device, [`${other}/battery_headset`]: battery },
			devicePath,
		),
		undefined,
	);
});

check("a path that only starts with the device path is not its child", () => {
	// `dev_…_F7` and `dev_…_F70` share a prefix. A prefix match without the
	// separator would hand one device's battery to the other.
	assert.equal(
		findBatteryPath(
			{
				[devicePath]: device,
				"/org/bluez/hci0/dev_1C_52_16_B4_7F_F70/battery_headset": battery,
			},
			devicePath,
		),
		undefined,
	);
});

check("the first child in path order answers when there are several", () => {
	// Deterministic: the value shown must not depend on the bus's key order.
	const second = `${devicePath}/battery_right`;
	const first = `${devicePath}/battery_case`;
	assert.equal(
		findBatteryPath(
			{ [devicePath]: device, [second]: battery, [first]: battery },
			devicePath,
		),
		first,
	);
});

check("no battery interface anywhere is no reading", () => {
	assert.equal(findBatteryPath({ [devicePath]: device }, devicePath), undefined);
	assert.equal(findBatteryPath({}, devicePath), undefined);
});

check("an unknown device path asks for nothing", () => {
	// The device is not on the bus at all; scanning would match its children to
	// nothing useful, so the call is not made.
	assert.equal(findBatteryPath({ [devicePath]: { ...device, ...battery } }, ""), undefined);
});

console.log(`${checks} checks passed`);
