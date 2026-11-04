import { Icon } from "@vicinae/api";
import type { Device } from "@/bluetooth";

const SCAN_DURATION_MS = 10_000;
const MAC_ADDRESS = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const ICON = /Icon:\s+([^\s\n\r]+)/;
const BATTERY_LEVEL = /Battery Percentage: 0x[A-Fa-f0-9]{2}\s*\((\d+)\)/;
const CONNECTED_STATUS = /Connected:\s*yes/i;

export function normalizeMac(mac: string): string {
	return mac.toLowerCase().trim();
}

export function isMacLike(name: string): boolean {
	return MAC_ADDRESS.test(name);
}

export function isConnectedStatus(info: string): boolean {
	return CONNECTED_STATUS.test(info);
}

/** True if device display name is just a MAC (no friendly name resolved yet) */
export function isNameMacOnly(name: string, mac: string): boolean {
	return !name || name === mac || isMacLike(name);
}

export function getIconFromInfo(info: string) {
	const iconMatch = ICON.exec(info);
	if (iconMatch) {
		const bluezIcon = iconMatch[1].toLowerCase();
		if (
			bluezIcon.includes("headset") ||
			bluezIcon.includes("headphones") ||
			bluezIcon.includes("audio-card")
		) {
			return Icon.Headphones;
		}
		if (bluezIcon.includes("keyboard")) {
			return Icon.Keyboard;
		}
		if (bluezIcon.includes("mouse")) {
			return Icon.Mouse;
		}
		if (bluezIcon.includes("phone") || bluezIcon.includes("mobile")) {
			return Icon.Mobile;
		}
		if (
			bluezIcon.includes("gamepad") ||
			bluezIcon.includes("joystick") ||
			bluezIcon.includes("input-gaming")
		) {
			return Icon.GameController;
		}
		if (bluezIcon.includes("camera") || bluezIcon.includes("video")) {
			return Icon.Camera;
		}
		if (bluezIcon.includes("printer")) {
			return Icon.Print;
		}
		if (bluezIcon.includes("network") || bluezIcon.includes("wireless")) {
			return Icon.Network;
		}
		if (bluezIcon.includes("computer") || bluezIcon.includes("laptop")) {
			return Icon.Desktop;
		}
	}
	return Icon.Bluetooth;
}

export function getBatteryLevel(info: string): number | undefined {
	// BlueZ outputs "Battery Percentage: 0x46 (70)" - capture decimal in parentheses
	const matches = info.match(BATTERY_LEVEL);
	if (!matches?.[1]) return undefined;
	return parseInt(matches[1], 10);
}

export function sortDevices(devices: Device[]): Device[] {
	return devices.sort((a, b) => {
		const aIsMacOnly = isMacLike(a.name) || a.name === a.mac;
		const bIsMacOnly = isMacLike(b.name) || b.name === b.mac;

		return aIsMacOnly === bIsMacOnly
			? a.name.localeCompare(b.name)
			: aIsMacOnly
				? 1
				: -1;
	});
}

export function removeFromDeviceList(
	mac: string,
	setDevices: React.Dispatch<React.SetStateAction<Device[]>>,
): void {
	const normalized = normalizeMac(mac);
	setDevices((prev) => prev.filter((d) => normalizeMac(d.mac) !== normalized));
}

export function stripAnsiCodes(text: string): string {
	// Remove ANSI escape sequences (ESC [... mGKHF])
	const ESC = String.fromCharCode(0x1b);
	return text.replace(new RegExp(`${ESC}\\[[0-9;]*[mGKHF]`, "g"), "");
}

export { SCAN_DURATION_MS };

const BLUETOOTH_ERROR_MAP: Record<string, string> = {
	ConnectionAttemptFailed:
		"Device unreachable. Ensure it's in pairing mode and in range.",
	AuthenticationFailed: "Pairing was rejected or failed. Try again.",
	NotReady: "Bluetooth adapter not ready. Try turning it off and on.",
	"Not Ready": "Bluetooth adapter not ready. Try Rescan in a moment.",
	NotAvailable: "Device is not available. It may be off or out of range.",
	NotPaired: "Device is not paired. Pair it first.",
	"Failed to pair": "Pairing failed. Ensure the device is in pairing mode.",
	"Failed to connect": "Connection failed. Try again.",
	"Failed to disconnect": "Disconnection failed.",
	"Failed to set trust": "Failed to trust device.",
	"Failed to set discoverable": "Failed to change discoverable state.",
};

export function humanizeBluetoothError(raw: string): string {
	const lower = raw.toLowerCase();
	for (const [key, message] of Object.entries(BLUETOOTH_ERROR_MAP)) {
		if (lower.includes(key.toLowerCase())) {
			return message;
		}
	}
	return raw;
}

import { execSync } from "node:child_process";

export function getActiveCodecs(): Record<string, string> {
	const result: Record<string, string> = {};
	try {
		const out = execSync("pactl list cards", {
			encoding: "utf8",
			timeout: 3000,
			stdio: ["ignore", "pipe", "ignore"],
		});
		const sections = out.split(/^Card #/m);
		for (const sec of sections) {
			if (!sec.trim()) continue;
			const nameMatch = sec.match(/Name:\s*(.+)/);
			if (!nameMatch) continue;
			const name = nameMatch[1].trim().toLowerCase();
			if (!name.includes("bluez")) continue;
			const activeMatch = sec.match(/Active Profile:\s*(.+)/);
			if (!activeMatch) continue;
			const profile = activeMatch[1].trim().toLowerCase();
			if (profile === "off") continue;
			let codec: string | undefined;
			if (profile.includes("ldac")) codec = "LDAC";
			else if (profile.includes("aptx_hd") || profile.includes("aptx-hd"))
				codec = "aptX HD";
			else if (profile.includes("aptx")) codec = "aptX";
			else if (profile.includes("aac")) codec = "AAC";
			else if (profile.includes("lc3")) codec = "LC3";
			else if (profile.includes("opus")) codec = "Opus";
			else if (profile.includes("msbc")) codec = "mSBC";
			else if (profile.includes("cvsd")) codec = "CVSD";
			else if (profile.includes("sbc")) codec = "SBC";
			else if (profile.includes("a2dp")) codec = "A2DP";
			else if (profile.includes("headset")) codec = "HFP";
			else codec = profile;
			// Extract MAC from card name: bluez_card.XX_XX_XX_XX_XX_XX
			const macMatch = name.match(/bluez_card\.([0-9a-f_]{17})/);
			if (macMatch) {
				const mac = macMatch[1].replace(/_/g, ":").toUpperCase();
				result[mac.toLowerCase()] = codec;
			}
		}
	} catch {
		// pactl unavailable
	}
	return result;
}
