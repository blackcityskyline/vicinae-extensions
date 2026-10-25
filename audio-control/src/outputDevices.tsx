import { useCallback, useMemo, useState } from "react";
import { useAudioState } from "./hooks/useAudioState";
import { useBluetoothDevices } from "./hooks/useBluetoothDevices";
import { sortDevicesWithDefaultFirst } from "./utils/sortDevices";
import { Icon, List } from "@vicinae/api";
import { displayNameForDevice } from "./utils/displayNameForDevice";
import { AudioDeviceItem } from "./components/AudioDeviceItem";
import { BluetoothDeviceItem } from "./components/BluetoothDeviceItem";
import { LoadingError } from "./components/LoadingError";
import {
  bluetoothAddressForSink,
  isPipeWireServer,
} from "./utils/audioServer";

export default function OutputDevices() {
  const { audio, isLoading, refresh: refreshAudio } = useAudioState();
  const { devices: bluetoothDevices, refresh: refreshBluetooth } =
    useBluetoothDevices();
  const [showDetail, setShowDetail] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all([refreshAudio(), refreshBluetooth()]);
  }, [refreshAudio, refreshBluetooth]);

  const sinksSorted = useMemo(
    () =>
      sortDevicesWithDefaultFirst(
        audio?.sinks ?? [],
        audio?.info.default_sink_name,
        displayNameForDevice,
      ),
    [audio],
  );

  const pairedBluetooth = useMemo(() => {
    const sinkAddresses = new Set(
      (audio?.sinks ?? [])
        .map((sink) => bluetoothAddressForSink(sink))
        .filter((address): address is string => !!address),
    );
    return bluetoothDevices.filter(
      (device) => !sinkAddresses.has(device.address),
    );
  }, [audio, bluetoothDevices]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle="Output Devices"
      searchBarPlaceholder="Search output devices"
    >
      {!isLoading && !audio ? <LoadingError /> : null}
      {!isLoading &&
      audio &&
      sinksSorted.length === 0 &&
      pairedBluetooth.length === 0 ? (
        <List.EmptyView
          icon={Icon.SpeakerOff}
          title="No output devices"
          description="Connect a speaker, headphones or a virtual sink, then press Refresh."
        />
      ) : null}
      {sinksSorted.length ? (
        <List.Section title="Outputs">
          {sinksSorted.map((sink) => (
            <AudioDeviceItem
              kind="sink"
              key={sink.name}
              toggleDetail={() => setShowDetail((prev) => !prev)}
              device={sink}
              defaultName={audio?.info.default_sink_name}
              refresh={refresh}
              sinks={audio?.sinks ?? []}
              groups={audio?.outputGroups ?? []}
              pipewire={isPipeWireServer(audio?.info.server_name)}
            />
          ))}
        </List.Section>
      ) : null}
      {pairedBluetooth.length ? (
        <List.Section
          title="Paired Bluetooth"
          subtitle="Kept visible while disconnected"
        >
          {pairedBluetooth.map((device) => (
            <BluetoothDeviceItem
              key={device.address}
              device={device}
              refresh={refresh}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
