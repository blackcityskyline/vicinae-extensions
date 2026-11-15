import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { pactl, type PactlDevice, type PactlStream } from "../pactl";
import { useAudioState } from "../hooks/useAudioState";
import { showErrorToast } from "../ui/toasts";
import { appNameForStream } from "../utils/appNameForStream";
import { displayNameForDevice } from "../utils/displayNameForDevice";

/**
 * Move one playing stream to the device it was opened from.
 *
 * `set-default-sink` only affects streams started afterwards; an app that is
 * already playing stays where it is until its stream is moved. On a group sink
 * the move lands in the group, not in a single member.
 */
export function MoveStreamToDevice(props: {
  device: PactlDevice;
  onDone: () => Promise<void>;
}) {
  const { device, onDone } = props;
  const { audio, isLoading } = useAudioState();
  const { pop } = useNavigation();
  const streams = audio?.sinkInputs ?? [];
  const sinks = audio?.sinks ?? [];

  async function move(stream: PactlStream): Promise<void> {
    try {
      await pactl.setDeviceForStream(stream.index, device.name, "sink");
      await onDone();
      pop();
    } catch (e) {
      await showErrorToast({ title: "Failed to move stream", error: e });
    }
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Move a Stream to ${displayNameForDevice(device)}`}
      searchBarPlaceholder="Search playing streams"
    >
      {!isLoading && streams.length === 0 ? (
        <List.EmptyView
          icon={Icon.SpeakerOff}
          title="Nothing is playing"
          description="Start playback in an app, then move its stream here."
        />
      ) : null}
      {streams.map((stream) => {
        const title = appNameForStream(stream);
        const current = sinks.find((sink) => sink.index === stream.sink);
        return (
          <List.Item
            key={stream.index}
            title={title}
            icon={Icon.SpeakerHigh}
            subtitle={current ? displayNameForDevice(current) : undefined}
            keywords={[title, current ? displayNameForDevice(current) : ""]}
            actions={
              <ActionPanel>
                <Action
                  title="Move Here"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: ["ctrl"], key: "m" }}
                  onAction={() => move(stream)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
