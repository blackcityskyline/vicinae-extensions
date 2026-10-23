import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  Toast,
  environment,
  showToast,
} from "@vicinae/api";
import { join } from "node:path";

import { reconnectBluetoothSink } from "../bluetooth";
import { pactl, type PactlDevice } from "../pactl";
import { detailsShortcut } from "../shortcuts";
import { micIconForMute, speakerIconForPercentAndMute } from "../ui/audioIcons";
import { deviceAccessories } from "../ui/deviceAccessories";
import { clamp } from "../ui/format";
import { showErrorToast } from "../ui/toasts";
import { bluetoothAddressForSink } from "../utils/audioServer";
import { displayNameForDevice } from "../utils/displayNameForDevice";
import { ungroupTarget, type OutputGroup } from "../utils/outputGroups";
import { percentFromVolume } from "../utils/percentFromVolume";
import { AudioDeviceDetail } from "./AudioDeviceDetail";
import { GroupOutputs } from "./GroupOutputs";
import { SetVolumeForm } from "./SetVolumeForm";

export function AudioDeviceItem(props: {
  kind: "sink" | "source";
  device: PactlDevice;
  defaultName?: string;
  refresh: () => Promise<void>;
  toggleDetail: () => void;
  sinks: PactlDevice[];
  groups: OutputGroup[];
  pipewire: boolean;
}) {
  const {
    device,
    kind,
    defaultName,
    refresh,
    toggleDetail,
    sinks,
    groups,
    pipewire,
  } = props;
  const isDefault = !!defaultName && device.name === defaultName;
  const vol = percentFromVolume(device.volume);

  const icon =
    kind === "sink"
      ? speakerIconForPercentAndMute(vol, device.mute)
      : micIconForMute(device.mute);
  const group =
    kind === "sink"
      ? groups.find((candidate) => candidate.sinkName === device.name)
      : undefined;
  const memberNames =
    group?.members.map(
      (name) => sinks.find((sink) => sink.name === name)?.description ?? name,
    ) ?? [];
  const title =
    kind === "sink" && group ? "Output Group" : displayNameForDevice(device);
  const bluetoothAddress =
    kind === "sink" ? bluetoothAddressForSink(device) : undefined;

  const typeLabel = kind === "sink" ? "Output" : "Input";

  async function setAsDefault(): Promise<void> {
    try {
      await pactl.setDefaultDevice(device.name, kind);
      await showToast({
        style: Toast.Style.Success,
        title: `Default ${typeLabel.toLowerCase()} updated`,
        message: title,
      });
      await refresh();
    } catch (e) {
      await showErrorToast({
        title: `Failed to set default ${typeLabel.toLowerCase()}`,
        error: e,
      });
    }
  }

  async function toggleMute(): Promise<void> {
    try {
      await pactl.setDeviceMute(device.name, kind, "toggle");
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to toggle mute", error: e });
    }
  }

  async function setVolume(next: number): Promise<void> {
    try {
      const safe = clamp(next, 0, 150);
      await pactl.setDeviceVolume(device.name, safe, kind);
      await refresh();
    } catch (e) {
      await showErrorToast({ title: "Failed to change volume", error: e });
    }
  }

  async function playTestSound(): Promise<void> {
    try {
      await pactl.playTestSound(
        device.name,
        join(environment.assetsPath, "test-sound.wav"),
      );
      await showToast({
        style: Toast.Style.Success,
        title: "Test sound played",
        message: title,
      });
    } catch (e) {
      await showErrorToast({ title: "Failed to play the test sound", error: e });
    }
  }

  async function disbandGroup(target: OutputGroup): Promise<void> {
    try {
      const fallback = ungroupTarget(
        target,
        sinks.map((sink) => sink.name),
      );
      if (isDefault && fallback) {
        await pactl.setDefaultDevice(fallback, "sink");
        await pactl.moveAllSinkInputs(fallback);
      }
      await pactl.unloadModule(target.moduleId);
      await showToast({
        style: Toast.Style.Success,
        title: "Output group disbanded",
      });
      await refresh();
    } catch (e) {
      await showErrorToast({
        title: "Failed to disband the output group",
        error: e,
      });
    }
  }

  async function reconnect(): Promise<void> {
    if (!bluetoothAddress) return;
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Reconnecting Bluetooth output",
        message: title,
      });
      const sink = await reconnectBluetoothSink({
        address: bluetoothAddress,
        pactl,
      });
      await pactl.setDefaultDevice(sink.name, "sink");
      await pactl.moveAllSinkInputs(sink.name);
      await showToast({
        style: Toast.Style.Success,
        title: "Bluetooth output reconnected",
        message: displayNameForDevice(sink),
      });
      await refresh();
    } catch (e) {
      await showErrorToast({
        title: "Failed to reconnect the Bluetooth output",
        error: e,
      });
    }
  }

  const actions = (
    <ActionPanel title={title}>
      <ActionPanel.Section title="Device">
        {!isDefault ? (
          <Action
            title={`Set as Default ${typeLabel}`}
            icon={Icon.CheckCircle}
            onAction={setAsDefault}
          />
        ) : null}
        <Action
          title={device.mute ? `Unmute ${typeLabel}` : `Mute ${typeLabel}`}
          icon={icon}
          onAction={toggleMute}
        />
        <Action.CopyToClipboard
          title="Copy Device Name"
          content={device.name}
        />
        <Action
          shortcut={detailsShortcut}
          title="Toggle Details"
          icon={Icon.Eye}
          onAction={toggleDetail}
        />
      </ActionPanel.Section>
      {kind === "sink" ? (
        <ActionPanel.Section title="Output">
          <Action
            title="Play Test Sound"
            icon={Icon.Play}
            onAction={playTestSound}
          />
          {bluetoothAddress ? (
            <Action
              title="Reconnect Bluetooth Output"
              icon={Icon.Bluetooth}
              onAction={reconnect}
            />
          ) : null}
          {group ? (
            <Action
              title="Disband Output Group"
              icon={Icon.Trash}
              onAction={() => disbandGroup(group)}
            />
          ) : (
            <Action.Push
              title="Group Outputs…"
              icon={Icon.Link}
              target={
                <GroupOutputs
                  sinks={sinks}
                  groups={groups}
                  pipewire={pipewire}
                  onDone={refresh}
                />
              }
            />
          )}
        </ActionPanel.Section>
      ) : null}
      <ActionPanel.Section title="Volume">
        <Action
          title="Increase Volume (+5%)"
          icon={Icon.SpeakerUp}
          onAction={() => setVolume((vol ?? 0) + 5)}
        />
        <Action
          title="Decrease Volume (-5%)"
          icon={Icon.SpeakerDown}
          onAction={() => setVolume((vol ?? 0) - 5)}
        />
        <Action.Push
          title="Set Volume…"
          icon={Icon.Gauge}
          target={
            <SetVolumeForm
              kind={kind}
              type="device"
              deviceName={device.name}
              deviceTitle={title}
              currentPercent={vol}
              onDone={refresh}
            />
          }
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Other">
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={refresh}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List.Item
      title={title}
      icon={icon}
      subtitle={group ? memberNames.join(", ") : undefined}
      accessories={deviceAccessories({
        isDefault,
        muted: device.mute,
        volumePercent: vol,
      })}
      detail={
        <AudioDeviceDetail
          kind={kind}
          device={device}
          isDefault={isDefault}
          volumePercent={vol}
          groupMembers={memberNames}
        />
      }
      actions={actions}
      keywords={[device.name, device.description ?? "", ...memberNames]}
    />
  );
}
