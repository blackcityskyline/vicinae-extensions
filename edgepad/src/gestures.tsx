import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Icon,
  launchCommand,
  LaunchType,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import GestureForm from "./components/gesture-form";
import SliderForm from "./components/slider-form";
import { applyConfig, edgepad, readConfigText, spawnDetached, systemctl } from "./lib/cli";
import { getPrefs } from "./lib/prefs";
import {
  DIRECTIONS,
  deleteGesture,
  deleteSlider,
  parseConfig,
  type GestureBinding,
  type ParsedConfig,
  type SliderBinding,
  ZONES,
} from "./lib/toml";
import { directionIcon, directionLabel, fingersTag, gestureSubtitle, sliderSubtitle, zoneLabel } from "./lib/ui";
import { useConfigs } from "./lib/use-configs";

async function openCommand(name: string): Promise<void> {
  try {
    await launchCommand({ name, type: LaunchType.UserInitiated });
  } catch (error) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open the command", message: String(error) });
  }
}

export default function Gestures() {
  const prefs = useMemo(getPrefs, []);
  const { configs, selected, dir, isLoading, error, select, reload } = useConfigs();
  const [doc, setDoc] = useState<ParsedConfig>();
  const [readError, setReadError] = useState("");
  const [version, setVersion] = useState(0);

  const refresh = () => setVersion((value) => value + 1);

  useEffect(() => {
    if (!selected) {
      setDoc(undefined);
      return;
    }
    try {
      setDoc(parseConfig(readConfigText(selected)));
      setReadError("");
    } catch (failure) {
      setDoc(undefined);
      setReadError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [selected, version]);

  async function serviceAction(action: "reload" | "restart" | "start" | "stop"): Promise<void> {
    const result = await systemctl([action, prefs.serviceName]);
    const verb = { reload: "reloaded", restart: "restarted", start: "started", stop: "stopped" }[action];
    await showToast({
      style: result.code === 0 ? Toast.Style.Success : Toast.Style.Failure,
      title: result.code === 0 ? `Service ${verb}` : `Could not ${action} the service`,
      message: result.code === 0 ? undefined : result.stderr.trim() || `exit ${result.code}`,
    });
  }

  async function removeGesture(binding: GestureBinding): Promise<void> {
    const title = `${zoneLabel(binding.value.zone)} · ${directionLabel(binding.value.direction)}`;
    const confirmed = await confirmAlert({
      title: `Delete ${title}?`,
      message: "The binding is removed from the config file.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed || !selected) return;
    try {
      const note = await applyConfig(prefs, selected, deleteGesture(readConfigText(selected), binding.index));
      await showToast({ style: Toast.Style.Success, title: "Gesture deleted", message: note || undefined });
      refresh();
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not delete the gesture",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  async function removeSlider(binding: SliderBinding): Promise<void> {
    const confirmed = await confirmAlert({
      title: `Delete the ${zoneLabel(binding.value.zone)} slider?`,
      message: "The binding is removed from the config file.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed || !selected) return;
    try {
      const note = await applyConfig(prefs, selected, deleteSlider(readConfigText(selected), binding.index));
      await showToast({ style: Toast.Style.Success, title: "Slider deleted", message: note || undefined });
      refresh();
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not delete the slider",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  async function runAction(argv: string[]): Promise<void> {
    if (argv.length === 0) return;
    try {
      await spawnDetached(argv);
      await showToast({ style: Toast.Style.Success, title: "Action started", message: argv.join(" ") });
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Could not run ${argv[0]}`,
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  async function copyDiagnostics(): Promise<void> {
    const result = await edgepad(prefs, ["status"]);
    if (result.code !== 0 && result.code !== 2) {
      await showToast({ style: Toast.Style.Failure, title: "edgepad status failed", message: result.stderr.trim() });
      return;
    }
    await Clipboard.copy(result.stdout);
    await showToast({
      style: Toast.Style.Success,
      title: "Diagnostics copied",
      message: result.stdout.split("\n").find((line) => line.startsWith("Result"))?.trim(),
    });
  }

  const configDropdown =
    configs.length > 0 ? (
      <List.Dropdown tooltip="Config" value={selected} onChange={(value) => void select(value)}>
        {configs.map((config) => (
          <List.Dropdown.Item
            key={config.path}
            title={config.active ? `${config.name} (session)` : config.name}
            value={config.path}
            icon={config.active ? Icon.CheckCircle : Icon.Text}
          />
        ))}
      </List.Dropdown>
    ) : undefined;

  const addGestures = (configPath: string) => (
    <ActionPanel.Section title="Edit">
      <Action.Push
        title="Add Gesture"
        icon={Icon.Plus}
        shortcut="new"
        target={<GestureForm configPath={configPath} onSaved={refresh} />}
      />
      <Action.Push
        title="Add Slider"
        icon={Icon.Mouse}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
        target={<SliderForm configPath={configPath} onSaved={refresh} />}
      />
      <Action
        title="Reload Service"
        icon={Icon.Repeat}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
        onAction={() => void serviceAction("reload")}
      />
      <Action title="Health Check" icon={Icon.MedicalSupport} shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }} onAction={() => openCommand("health")} />
      <Action title="Settings" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "," }} onAction={() => openCommand("settings")} />
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => { refresh(); void reload(); }} />
    </ActionPanel.Section>
  );

  const configActions = (configPath: string) => (
    <ActionPanel>
      {addGestures(configPath)}
      <ActionPanel.Section title="Config">
        <Action.Open title="Open Config File" target={configPath} shortcut="edit" />
        <Action.CopyToClipboard title="Copy Config Path" content={configPath} shortcut="copy-path" />
        <Action.Open title="Open Config Folder" target={dir} icon={Icon.Folder} shortcut="open" />
        <ActionPanel.Submenu title="Switch Config" icon={Icon.Switch} shortcut={{ modifiers: ["ctrl"], key: "k" }}>
          {configs.map((config) => (
            <Action
              key={config.path}
              title={config.active ? `${config.name} (session)` : config.name}
              onAction={() => void select(config.path)}
            />
          ))}
        </ActionPanel.Submenu>
      </ActionPanel.Section>
      <ActionPanel.Section title="Service">
        <Action title="Restart Service" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "r" }} onAction={() => void serviceAction("restart")} />
        <Action title="Stop Service" icon={Icon.Stop} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "x" }} onAction={() => void serviceAction("stop")} />
        <Action title="Start Service" icon={Icon.Play} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "s" }} onAction={() => void serviceAction("start")} />
        <Action title="Copy Diagnostics" icon={Icon.CopyClipboard} shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }} onAction={() => void copyDiagnostics()} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  if (isLoading) return <List isLoading searchBarPlaceholder="Loading edgepad configs" />;

  if (!selected) {
    return (
      <List searchBarPlaceholder="Search gestures">
        <List.EmptyView
          icon={Icon.Warning}
          title="No edgepad config found"
          description={error ?? `No .toml files in ${dir}.`}
          actions={
            <ActionPanel>
              <Action.Open title="Open Config Folder" target={dir} icon={Icon.Folder} shortcut="open" />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void reload()} />
              <Action title="Health Check" icon={Icon.MedicalSupport} shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }} onAction={() => openCommand("health")} />
              <Action title="Settings" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "," }} onAction={() => openCommand("settings")} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!doc) {
    return (
      <List searchBarPlaceholder="Search gestures">
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="Could not read the config"
          description={readError}
          actions={
            <ActionPanel>
              <Action.Open title="Open Config File" target={selected} icon={Icon.Pencil} shortcut="open" />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
              <Action title="Health Check" icon={Icon.MedicalSupport} shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }} onAction={() => openCommand("health")} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const groups = ZONES.map((zone) => ({
    zone,
    sliders: doc.sliders.filter((binding) => binding.value.zone === zone),
    gestures: doc.gestures
      .filter((binding) => binding.value.zone === zone)
      .sort(
        (a, b) =>
          DIRECTIONS.indexOf(a.value.direction) - DIRECTIONS.indexOf(b.value.direction) ||
          (a.value.fingers ?? 0) - (b.value.fingers ?? 0),
      ),
  })).filter((group) => group.sliders.length > 0 || group.gestures.length > 0);

  const bindingCount = doc.gestures.length + doc.sliders.length;
  const active = configs.find((config) => config.path === selected);
  const configName = active?.name ?? selected.split("/").pop() ?? selected;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search gestures, commands or zones"
      navigationTitle={configName}
      searchBarAccessory={configDropdown}
    >
      <List.Section title="Config">
        <List.Item
          title={configName}
          subtitle={selected}
          icon={active?.active ? Icon.CheckCircle : Icon.Text}
          accessories={[{ tag: active?.active ? "session config" : "selected" }, { tag: `${bindingCount} bindings` }]}
          actions={configActions(selected)}
        />
      </List.Section>

      {groups.map((group) => (
        <List.Section
          key={group.zone}
          title={`${zoneLabel(group.zone)} · ${group.sliders.length + group.gestures.length}`}
        >
          {group.sliders.map((binding) => (
            <List.Item
              key={`slider-${binding.index}`}
              title="Slider"
              subtitle={sliderSubtitle(binding.value)}
              icon={Icon.Mouse}
              accessories={[{ tag: `step ${binding.value.step}` }, { tag: "slider" }]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Edit Slider"
                    icon={Icon.Pencil}
                    shortcut="edit"
                    target={<SliderForm configPath={selected} existing={binding} onSaved={refresh} />}
                  />
                  <Action
                    title="Delete Slider"
                    icon={Icon.Trash}
                    style="destructive"
                    shortcut="remove"
                    onAction={() => void removeSlider(binding)}
                  />
                  <Action.CopyToClipboard title="Copy Config Path" content={selected} shortcut="copy" />
                  {addGestures(selected)}
                </ActionPanel>
              }
            />
          ))}

          {group.gestures.map((binding) => {
            const gesture = binding.value;
            const accessories: List.Item.Accessory[] = [{ tag: fingersTag(gesture) }];
            if (gesture.action.kind === "log") accessories.push({ tag: "log" });
            const argv = gesture.action.kind === "command" ? gesture.action.argv : [];
            return (
              <List.Item
                key={`gesture-${binding.index}`}
                title={directionLabel(gesture.direction)}
                subtitle={gestureSubtitle(gesture)}
                icon={directionIcon(gesture.direction)}
                accessories={accessories}
                actions={
                  <ActionPanel>
                    <Action.Push
                      title="Edit Gesture"
                      icon={Icon.Pencil}
                      shortcut="edit"
                      target={
                        <GestureForm
                          configPath={selected}
                          existing={{ index: binding.index, value: gesture }}
                          onSaved={refresh}
                        />
                      }
                    />
                    {argv.length > 0 && (
                      <Action
                        title="Run Action Now"
                        icon={Icon.Play}
                        shortcut="open"
                        onAction={() => void runAction(argv)}
                      />
                    )}
                    <Action
                      title="Delete Gesture"
                      icon={Icon.Trash}
                      style="destructive"
                      shortcut="remove"
                      onAction={() => void removeGesture(binding)}
                    />
                    {gesture.action.kind === "command" && (
                      <Action.CopyToClipboard title="Copy Command" content={gesture.action.argv.join(" ")} shortcut="copy" />
                    )}
                    <Action.CopyToClipboard title="Copy Config Path" content={selected} shortcut="copy-path" />
                    {addGestures(selected)}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}

      {doc.issues.length > 0 && (
        <List.Section title="Problems">
          {doc.issues.map((issue) => (
            <List.Item
              key={issue}
              title="Config problem"
              subtitle={issue}
              icon={Icon.XMarkCircle}
              actions={
                <ActionPanel>
                  <Action.Open title="Open Config File" target={selected} icon={Icon.Pencil} shortcut="open" />
                  <Action title="Health Check" icon={Icon.MedicalSupport} shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }} onAction={() => openCommand("health")} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {bindingCount === 0 && (
        <List.EmptyView
          icon={Icon.Mouse}
          title="No gestures in this config"
          description={`${configName} has no bindings yet. Add a gesture or a slider; both are written to the file and the service reloads.`}
          actions={
            <ActionPanel>
              <Action.Push title="Add Gesture" icon={Icon.Plus} shortcut="new" target={<GestureForm configPath={selected} onSaved={refresh} />} />
              <Action.Push
                title="Add Slider"
                icon={Icon.Mouse}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                target={<SliderForm configPath={selected} onSaved={refresh} />}
              />
              <Action.Open title="Open Config File" target={selected} icon={Icon.Pencil} shortcut="open" />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
