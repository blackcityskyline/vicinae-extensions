import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  showToast,
} from "@vicinae/api";

import { reconnectBluetoothSink } from "../bluetooth";
import { pactl } from "../pactl";
import { outputShortcuts } from "../shortcuts";
import { showErrorToast } from "../ui/toasts";
import type { BluetoothDevice } from "../utils/audioServer";

export function BluetoothDeviceItem(props: {
  device: BluetoothDevice;
  refresh: () => Promise<void>;
}) {
  const { device, refresh } = props;

  async function connectAndUse(): Promise<void> {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: device.connected ? "Reconnecting Bluetooth output" : "Connecting Bluetooth output",
        message: device.name,
      });
      const sink = await reconnectBluetoothSink({
        address: device.address,
        pactl,
      });
      await pactl.setDefaultDevice(sink.name, "sink");
      await pactl.moveAllSinkInputs(sink.name);
      await showToast({
        style: Toast.Style.Success,
        title: "Bluetooth output connected",
        message: device.name,
      });
      await refresh();
    } catch (error) {
      await showErrorToast({
        title: "Failed to connect the Bluetooth output",
        error,
      });
    }
  }

  return (
    <List.Item
      title={device.name}
      subtitle={device.address}
      icon={Icon.Bluetooth}
      keywords={[device.address]}
      accessories={[
        {
          icon: Icon.Bluetooth,
          tooltip: "Bluetooth",
          tag: {
            value: device.connected ? "Connected" : "Not connected",
            color: device.connected ? Color.Green : Color.SecondaryText,
          },
        },
      ]}
      actions={
        <ActionPanel title={device.name}>
          <ActionPanel.Section title="Bluetooth">
            <Action
              title={device.connected ? "Reconnect Output" : "Connect and Use Output"}
              icon={Icon.Plug}
              shortcut={outputShortcuts.reconnect}
              onAction={connectAndUse}
            />
            <Action.CopyToClipboard
              title="Copy Bluetooth Address"
              content={device.address}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Other">
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              onAction={refresh}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
