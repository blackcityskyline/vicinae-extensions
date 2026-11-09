import {
	Action,
	ActionPanel,
	Color,
	Form,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	Bluetooth,
	connectToDevice,
	type Device,
	DeviceOptions,
	disconnectFromDevice,
	removeDevice,
	trustDevice,
	untrustDevice,
	renameDevice,
} from "@/bluetooth";
import { getActiveCodecs, getBatteryLevel, getIconFromInfo, isConnectedStatus, normalizeMac } from "@/utils";

interface Preferences {
	connectionToggleable: boolean;
}

// Custom hook for managing paired devices
function usePairedDevices() {
	const [devices, setDevices] = useState<Device[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchDevices = useCallback(async (silent = false): Promise<Device[]> => {
		try {
			const initialDevices = await Bluetooth.listDevices(DeviceOptions.PAIRED);
			const codecs = getActiveCodecs();
			const devices: Device[] = [];

			for (const { mac, name } of initialDevices) {
				try {
					const info = await Bluetooth.getInfo(mac);
					const connected = isConnectedStatus(info);
					const trusted = info.includes("Trusted: yes");
					const icon = getIconFromInfo(info);
					const batteryLevel = getBatteryLevel(info);
					devices.push({
						name: name || mac,
						mac,
						connected,
						trusted,
						icon,
						batteryLevel,
						codec: codecs[normalizeMac(mac)],
					});
				} catch (err) {
					console.error(`Failed to get info for ${mac}:`, err);
					devices.push({
						name: name || mac,
						mac,
						connected: false,
						trusted: false,
						icon: Icon.Bluetooth,
						codec: codecs[normalizeMac(mac)],
					});
				}
			}

			return devices.sort((a, b) => {
				if (a.connected !== b.connected) return a.connected ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
		} catch (error) {
			if (!silent) {
				showToast({
					style: Toast.Style.Failure,
					title: "Failed to fetch Bluetooth devices",
				});
			}
			console.error(error);
			return [];
		}
	}, []);

	const refreshDevices = useCallback(async () => {
		setLoading(true);
		const newDevices = await fetchDevices(false);
		setDevices(newDevices);
		setLoading(false);
	}, [fetchDevices]);

	const silentRefresh = useCallback(async () => {
		const newDevices = await fetchDevices(true);
		setDevices(newDevices);
	}, [fetchDevices]);

	useEffect(() => {
		refreshDevices();
	}, [refreshDevices]);

	useEffect(() => {
		const id = setInterval(() => {
			silentRefresh();
		}, 2000);
		return () => clearInterval(id);
	}, [silentRefresh]);

	return { devices, loading, refreshDevices };
}

// Enhanced Bluetooth action handler using the refactored functions
async function performBluetoothAction(
	device: Device,
	action: string,
): Promise<void> {
	switch (action) {
		case "connect":
			await connectToDevice(device);
			break;
		case "reconnect":
			await disconnectFromDevice(device);
			await connectToDevice(device);
			break;
		case "disconnect":
			await disconnectFromDevice(device);
			break;
		case "remove":
			await removeDevice(device);
			break;
		case "trust":
			await trustDevice(device);
			break;
		case "untrust":
			await untrustDevice(device);
			break;
		default:
			console.error(`Unknown action: ${action}`);
			await showToast({
				style: Toast.Style.Failure,
				title: "Unknown Action",
				message: `Unknown action: ${action}`,
			});
			return;
	}
}

function batteryIconColor(batteryLevel: number): Color {
	if (batteryLevel > 20) return Color.Green;
	else if (batteryLevel > 5) return Color.Orange;
	else return Color.Red;
}

// Device detail component
function DeviceDetail({ device }: { device: Device }) {
	return (
		<List.Item.Detail
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label
						title="Device Name"
						text={device.name}
					/>
					<List.Item.Detail.Metadata.Label
						title="MAC Address"
						text={device.mac}
					/>
					<List.Item.Detail.Metadata.Separator />
					<List.Item.Detail.Metadata.Label
						title="Trust Status"
						text={device.trusted ? "Trusted" : "Not Trusted"}
						icon={{
							source: Icon.Lock,
							tintColor: device.trusted ? Color.Green : Color.Orange,
						}}
					/>
					<List.Item.Detail.Metadata.Label
						title="Connection Status"
						text={device.connected ? "Connected" : "Disconnected"}
						icon={{
							source: device.connected ? Icon.CircleProgress : Icon.XMarkCircle,
							tintColor: device.connected ? Color.Green : Color.Red,
						}}
					/>
					<List.Item.Detail.Metadata.Label
						title="Codec"
						text={device.codec ?? "—"}
						icon={{ source: Icon.Music, tintColor: Color.Green }}
					/>
					<List.Item.Detail.Metadata.Label
						title="Battery Level"
						text={
							typeof device.batteryLevel === "number"
								? `${device.batteryLevel} %`
								: "—"
						}
						icon={{
							source: Icon.Battery,
							tintColor:
								typeof device.batteryLevel === "number"
									? batteryIconColor(device.batteryLevel)
									: undefined,
						}}
					/>
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

// Action handler factory functions
function createDeviceActionHandler(
	action: string,
	device: Device,
	refreshDevices: () => Promise<void>,
) {
	return async () => {
		try {
			await performBluetoothAction(device, action);
		} catch (error) {
			console.error(`Failed to perform ${action} on ${device.name}:`, error);
			// The individual bluetooth functions already show toasts for errors
			// via the centralized parsing system, so we don't need to show another one
		} finally {
			// Always refresh to get the latest state
			await refreshDevices();
		}
	};
}

// Toggle connection handler
function createToggleConnectionHandler(
	device: Device,
	refreshDevices: () => Promise<void>,
) {
	return async () => {
		try {
			if (device.connected) {
				await disconnectFromDevice(device);
			} else {
				await connectToDevice(device);
			}
		} catch (error) {
			console.error(
				`Failed to ${device.connected ? "disconnect from" : "connect to"} ${device.name}:`,
				error,
			);
			// Error toasts are handled by the individual functions
		} finally {
			// Always refresh to get the latest state
			await refreshDevices();
		}
	};
}

// Device list item component
function DeviceListItem({
	device,
	showingDetail,
	refreshDevices,
	toggleDetails,
	connectionToggleable,
}: {
	device: Device;
	showingDetail: boolean;
	refreshDevices: () => Promise<void>;
	toggleDetails: () => void;
	connectionToggleable: boolean;
}) {
	return (
		<List.Item
			key={device.mac}
			title={device.name}
			subtitle={device.mac}
			icon={
				device.connected
					? { source: device.icon, tintColor: Color.Yellow }
					: device.icon
			}
			accessories={
				!showingDetail
					? [
							{
								text: device.trusted
									? { value: "Trusted", color: Color.Green }
									: { value: "Not Trusted", color: Color.Orange },
								icon: Icon.Lock,
							},
							{
								text: device.connected
									? { value: "Connected", color: Color.Green }
									: { value: "Disconnected", color: Color.Red },
								icon: device.connected ? Icon.CircleProgress : Icon.XMarkCircle,
							},
						]
					: undefined
			}
			detail={showingDetail ? <DeviceDetail device={device} /> : undefined}
			actions={
				<ActionPanel>
					{connectionToggleable ? (
						<Action
							title={device.connected ? "Disconnect" : "Connect"}
							icon={device.connected ? Icon.WifiDisabled : Icon.Wifi}
							style={device.connected ? "destructive" : undefined}
							shortcut={{ modifiers: ["ctrl"], key: "c" }}
							onAction={createToggleConnectionHandler(device, refreshDevices)}
						/>
					) : (
						<>
							<Action
								title={device.connected ? "Reconnect" : "Connect"}
								icon={device.connected ? Icon.ArrowClockwise : Icon.Wifi}
								shortcut={{ modifiers: ["ctrl"], key: "c" }}
								onAction={createDeviceActionHandler(
									device.connected ? "reconnect" : "connect",
									device,
									refreshDevices,
								)}
							/>
							<Action
								title="Disconnect"
								icon={Icon.WifiDisabled}
								style="destructive"
								shortcut={{ modifiers: ["ctrl"], key: "d" }}
								onAction={createDeviceActionHandler(
									"disconnect",
									device,
									refreshDevices,
								)}
							/>
						</>
					)}
					<Action
						title={device.trusted ? "Untrust" : "Trust"}
						icon={device.trusted ? Icon.HeartDisabled : Icon.Heart}
						shortcut={{ modifiers: ["ctrl"], key: "t" }}
						onAction={createDeviceActionHandler(
							device.trusted ? "untrust" : "trust",
							device,
							refreshDevices,
						)}
					/>
					<Action.Push
						title="Rename"
						icon={Icon.Pencil}
						shortcut="edit"
						target={<RenameDeviceForm device={device} onRenamed={refreshDevices} />}
					/>
					<Action
						title="Forget"
						icon={Icon.HeartDisabled}
						style="destructive"
						shortcut="remove"
						onAction={createDeviceActionHandler(
							"remove",
							device,
							refreshDevices,
						)}
					/>
					<ActionPanel.Section>
						<Action.Open
							title="Start Scanning"
							icon={Icon.Bluetooth}
							target="vicinae://extensions/Gelei/bluetooth/scan"
							shortcut={{ modifiers: ["ctrl"], key: "s" }}
						/>
						<Action.Open
							title="Make Discoverable"
							icon={Icon.Eye}
							target="vicinae://extensions/Gelei/bluetooth/discoverable"
							shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
						/>
						<Action
							title={showingDetail ? "Hide Details" : "Show Details"}
							icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
							onAction={toggleDetails}
							shortcut={{ modifiers: ["ctrl"], key: "i" }}
						/>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							shortcut="refresh"
							onAction={refreshDevices}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}

function RenameDeviceForm({
	device,
	onRenamed,
}: {
	device: Device;
	onRenamed: () => Promise<void>;
}) {
	const { pop } = useNavigation();
	const [name, setName] = useState(device.name);
	const [isLoading, setIsLoading] = useState(false);

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		setIsLoading(true);
		try {
			await renameDevice(device, trimmed);
			await onRenamed();
			pop();
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<Form isLoading={isLoading} actions={<ActionPanel><Action.SubmitForm title="Rename" icon={Icon.Check} onSubmit={submit} /></ActionPanel>}>
			<Form.TextField
				id="name"
				title="Device Name"
				value={name}
				onChange={setName}
			/>
		</Form>
	);
}

// Main component
export default function Devices() {
	const { devices, loading, refreshDevices } = usePairedDevices();
	const [showingDetail, setShowingDetail] = useState(true);
	const preferences = getPreferenceValues<Preferences>();

	const toggleDetails = useCallback(() => {
		setShowingDetail(!showingDetail);
	}, [showingDetail]);

	if (devices.length === 0 && !loading) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Bluetooth}
					title="No Devices Found"
					description="No paired Bluetooth devices available. Use the scan command to find new devices."
					actions={
						<ActionPanel>
							<Action.Open
								title="Start Scanning"
								icon={Icon.Bluetooth}
								target="vicinae://extensions/Gelei/bluetooth/scan"
								shortcut={{ modifiers: ["ctrl"], key: "s" }}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	return (
		<List
			isLoading={loading}
			searchBarPlaceholder="Search paired devices..."
			isShowingDetail={showingDetail}
			actions={
				<ActionPanel>
					<Action.Open
						title="Start Scanning"
						icon={Icon.Bluetooth}
						target="vicinae://extensions/Gelei/bluetooth/scan"
						shortcut={{ modifiers: ["ctrl"], key: "s" }}
					/>
					<Action
						title="Refresh Devices"
						icon={Icon.ArrowClockwise}
						shortcut="refresh"
						onAction={refreshDevices}
					/>
				</ActionPanel>
			}
		>
			{devices.map((device) => (
				<DeviceListItem
					key={device.mac}
					device={device}
					showingDetail={showingDetail}
					refreshDevices={refreshDevices}
					toggleDetails={toggleDetails}
					connectionToggleable={preferences.connectionToggleable}
				/>
			))}
		</List>
	);
}
