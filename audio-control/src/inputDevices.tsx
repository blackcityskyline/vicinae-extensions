import { useMemo, useState } from "react";
import { useAudioState } from "./hooks/useAudioState";
import { sortDevicesWithDefaultFirst } from "./utils/sortDevices";
import { Icon, List } from "@vicinae/api";
import { displayNameForDevice } from "./utils/displayNameForDevice";
import { isPipeWireServer } from "./utils/audioServer";
import { AudioDeviceItem } from "./components/AudioDeviceItem";
import { LoadingError } from "./components/LoadingError";

export default function InputDevices() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const sourcesSorted = useMemo(
    () =>
      sortDevicesWithDefaultFirst(
        audio?.sources ?? [],
        audio?.info.default_source_name,
        displayNameForDevice,
      ),
    [audio],
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle="Input Devices"
      searchBarPlaceholder="Search input devices"
    >
      {!isLoading && !audio ? <LoadingError /> : null}
      {!isLoading && audio && sourcesSorted.length === 0 ? (
        <List.EmptyView
          icon={Icon.MicrophoneDisabled}
          title="No input devices"
          description="Connect a microphone, then press Refresh."
        />
      ) : null}
      {sourcesSorted.map((source) => (
        <AudioDeviceItem
          kind="source"
          key={source.name}
          toggleDetail={() => setShowDetail((prev) => !prev)}
          device={source}
          defaultName={audio?.info.default_source_name}
          refresh={refresh}
          sinks={audio?.sinks ?? []}
          groups={audio?.outputGroups ?? []}
          pipewire={isPipeWireServer(audio?.info.server_name)}
        />
      ))}
    </List>
  );
}
