import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useMemo, useState } from "react";

import { pactl, type PactlDevice } from "../pactl";
import { showErrorToast } from "../ui/toasts";
import { displayNameForDevice } from "../utils/displayNameForDevice";
import {
  uniqueGroupSinkName,
  type OutputGroup,
} from "../utils/outputGroups";

export function GroupOutputs(props: {
  sinks: PactlDevice[];
  groups: OutputGroup[];
  pipewire: boolean;
  onDone: () => Promise<void>;
}) {
  const { sinks, groups, pipewire, onDone } = props;
  const { pop } = useNavigation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const groupSinkNames = useMemo(
    () => new Set(groups.map((group) => group.sinkName)),
    [groups],
  );
  const candidates = useMemo(
    () => sinks.filter((sink) => !groupSinkNames.has(sink.name)),
    [sinks, groupSinkNames],
  );

  function toggle(sinkName: string): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(sinkName)) next.delete(sinkName);
      else next.add(sinkName);
      return next;
    });
  }

  async function createGroup(): Promise<void> {
    const members = candidates
      .filter((sink) => selected.has(sink.name))
      .map((sink) => sink.name);
    if (members.length < 2 || busy) return;

    setBusy(true);
    let moduleId: number | undefined;
    try {
      const sinkName = uniqueGroupSinkName(
        sinks.map((sink) => sink.name),
        Math.floor(Date.now() / 1000),
      );
      moduleId = await pactl.loadCombineSink({ sinkName, members, pipewire });
      await pactl.setDefaultDevice(sinkName, "sink");
      await pactl.moveAllSinkInputs(sinkName);
      await showToast({
        style: Toast.Style.Success,
        title: "Output group created",
        message: `${members.length} outputs are playing as one`,
      });
      pop();
      await onDone();
    } catch (error) {
      if (moduleId !== undefined) {
        await pactl.unloadModule(moduleId).catch(() => undefined);
      }
      await showErrorToast({
        title: "Failed to create the output group",
        error,
      });
    } finally {
      setBusy(false);
    }
  }

  const canCreate = selected.size >= 2;

  return (
    <List
      isLoading={busy}
      navigationTitle="Group Outputs"
      searchBarPlaceholder="Select at least two outputs to combine"
    >
      {candidates.length < 2 ? (
        <List.EmptyView
          icon={Icon.SpeakerHigh}
          title="Two outputs are needed"
          description="Connect or enable a second output device, then open this again."
        />
      ) : null}
      {candidates.map((sink) => {
        const title = displayNameForDevice(sink);
        const isSelected = selected.has(sink.name);
        return (
          <List.Item
            key={sink.name}
            title={title}
            subtitle={sink.description}
            icon={isSelected ? Icon.CheckCircle : Icon.Circle}
            accessories={isSelected ? [{ tag: "Selected" }] : []}
            actions={
              <ActionPanel>
                <Action
                  title={isSelected ? "Remove from Group" : "Add to Group"}
                  icon={isSelected ? Icon.MinusCircle : Icon.PlusCircle}
                  onAction={() => toggle(sink.name)}
                />
                {canCreate ? (
                  <Action
                    title={`Create Group of ${selected.size}`}
                    icon={Icon.Link}
                    onAction={createGroup}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
