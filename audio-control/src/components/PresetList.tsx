import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  Keyboard,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";

import { applyPreset } from "../api/applyPreset";
import { deletePreset, loadPresets } from "../api/presets";
import { useAudioState } from "../hooks/useAudioState";
import { presetShortcuts } from "../shortcuts";
import { showErrorToast } from "../ui/toasts";
import type { OutputPreset } from "../utils/presets";

export function PresetList(props: {
  onApplied?: () => Promise<void>;
  closeOnApply?: boolean;
}) {
  const { onApplied, closeOnApply = false } = props;
  const { pop } = useNavigation();
  const { audio } = useAudioState();
  const [presets, setPresets] = useState<OutputPreset[] | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPresets(await loadPresets());
    } catch (error) {
      setPresets([]);
      await showErrorToast({ title: "Failed to read presets", error });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sinkNames = useMemo(
    () => new Set((audio?.sinks ?? []).map((sink) => sink.name)),
    [audio],
  );

  function labelFor(sinkName: string): string {
    return (
      audio?.sinks.find((sink) => sink.name === sinkName)?.description ??
      sinkName
    );
  }

  async function apply(preset: OutputPreset): Promise<void> {
    if (busyName) return;
    setBusyName(preset.name);
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: `Applying ${preset.name}`,
      });
      const result = await applyPreset(preset);
      await showToast({
        style: Toast.Style.Success,
        title: `${preset.name} applied`,
        message: `${result.grouped ? "Output group" : "Output"} · ${result.volumePercent}%`,
      });
      await onApplied?.();
      if (closeOnApply) pop();
    } catch (error) {
      await showErrorToast({ title: "Failed to apply the preset", error });
    } finally {
      setBusyName(null);
    }
  }

  async function remove(preset: OutputPreset): Promise<void> {
    const confirmed = await confirmAlert({
      title: `Delete “${preset.name}”?`,
      message: "Only the preset is removed; the audio devices stay as they are.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    try {
      await deletePreset(preset.name);
      await refresh();
      await showToast({ style: Toast.Style.Success, title: "Preset deleted" });
    } catch (error) {
      await showErrorToast({ title: "Failed to delete the preset", error });
    }
  }

  return (
    <List
      isLoading={presets === null || busyName !== null}
      navigationTitle="Output Presets"
      searchBarPlaceholder="Search presets"
    >
      {presets?.length === 0 ? (
        <List.EmptyView
          icon={Icon.Circle}
          title="No presets yet"
          description="In Output Devices, select an output or a group and choose Save Output Preset."
        />
      ) : null}
      {(presets ?? []).map((preset) => {
        const missing =
          audio === null
            ? []
            : preset.members.filter((member) => !sinkNames.has(member));
        return (
          <List.Item
            key={preset.name}
            title={preset.name}
            icon={preset.members.length > 1 ? Icon.Link : Icon.SpeakerHigh}
            subtitle={preset.members.map(labelFor).join(" + ")}
            accessories={[
              ...(missing.length
                ? [
                    {
                      tag: {
                        value: "Missing device",
                        color: "red" as const,
                      },
                    },
                  ]
                : []),
              { text: `${preset.volumePercent}%` },
            ]}
            actions={
              <ActionPanel title={preset.name}>
                <ActionPanel.Section title="Preset">
                  <Action
                    title="Apply Preset"
                    icon={Icon.Play}
                    shortcut={presetShortcuts.apply}
                    onAction={() => apply(preset)}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Other">
                  <Action
                    title="Delete Preset"
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => remove(preset)}
                  />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={Keyboard.Shortcut.Common.Refresh}
                    onAction={refresh}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
