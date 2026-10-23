import { useMemo, useState } from "react";
import { useAudioState } from "./hooks/useAudioState";
import { sortDevicesWithDefaultFirst } from "./utils/sortDevices";
import { Icon, List } from "@vicinae/api";
import { displayNameForDevice } from "./utils/displayNameForDevice";
import { AudioDeviceItem } from "./components/AudioDeviceItem";
import { LoadingError } from "./components/LoadingError";
import { isPipeWireServer } from "./utils/audioServer";

export default function OutputDevices() {
  const { audio, isLoading, refresh } = useAudioState();
  const [showDetail, setShowDetail] = useState(false);

  const sinksSorted = useMemo(
    () =>
      sortDevicesWithDefaultFirst(
        audio?.sinks ?? [],
        audio?.info.default_sink_name,
        displayNameForDevice,
      ),
    [audio],
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle="Output Devices"
      searchBarPlaceholder="Search output devices"
    >
      {!isLoading && !audio ? <LoadingError /> : null}
      {!isLoading && audio && sinksSorted.length === 0 ? (
        <List.EmptyView
          icon={Icon.SpeakerOff}
          title="No output devices"
          description="Connect a speaker, headphones or a virtual sink, then press Refresh."
        />
      ) : null}
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
    </List>
  );
}
