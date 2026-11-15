import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  launchCommand,
  LaunchType,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { edgepad, readConfigText, saveConfig, systemctl } from "./lib/cli";
import { getPrefs } from "./lib/prefs";
import {
  parseDevices,
  parseDoctor,
  parseStatus,
  type DeviceEntry,
  type DoctorReport,
  type Severity,
  type StatusReport,
} from "./lib/report";
import { setSetting } from "./lib/toml";
import { useConfigs } from "./lib/use-configs";

const SEVERITY_ICON: Record<Severity, Icon> = {
  ok: Icon.CheckCircle,
  warn: Icon.Warning,
  fail: Icon.XMarkCircle,
};

async function openCommand(name: string): Promise<void> {
  try {
    await launchCommand({ name, type: LaunchType.UserInitiated });
  } catch (error) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open the command", message: String(error) });
  }
}

type Report = {
  status: StatusReport;
  doctor: DoctorReport;
  devices: DeviceEntry[];
  raw: string;
};

function statusIcon(detail: string): Icon {
  return /fail|not found|invalid|inactive|dead|no touchpad/i.test(detail) ? Icon.XMarkCircle : Icon.CheckCircle;
}

export default function Health() {
  const prefs = useMemo(getPrefs, []);
  const { configs, selected, isLoading: configsLoading, select } = useConfigs();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setIsLoading(true);
    async function load() {
      const [status, doctor, devices] = await Promise.all([
        edgepad(prefs, ["status", "--config", selected!]),
        edgepad(prefs, ["doctor", "--config", selected!]),
        edgepad(prefs, ["devices"]),
      ]);
      if (cancelled) return;
      if (status.code === 127) {
        setError(status.stderr.trim() || "edgepad was not found");
        setReport(undefined);
      } else if (doctor.stdout.trim() === "" && status.stdout.trim() === "") {
        setError(doctor.stderr.trim() || status.stderr.trim() || "edgepad printed nothing");
        setReport(undefined);
      } else {
        setError("");
        setReport({
          status: parseStatus(status.stdout),
          doctor: parseDoctor(doctor.stdout),
          devices: parseDevices(devices.stdout),
          raw: [status.stdout, doctor.stdout, devices.stdout].filter((part) => part.trim() !== "").join("\n\n"),
        });
      }
      setIsLoading(false);
    }
    void load().catch((failure) => {
      if (cancelled) return;
      setError(failure instanceof Error ? failure.message : String(failure));
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [prefs, selected, version]);

  async function serviceAction(action: "reload" | "restart" | "start" | "stop"): Promise<void> {
    const result = await systemctl([action, prefs.serviceName]);
    const verb = { reload: "reloaded", restart: "restarted", start: "started", stop: "stopped" }[action];
    await showToast({
      style: result.code === 0 ? Toast.Style.Success : Toast.Style.Failure,
      title: result.code === 0 ? `Service ${verb}` : `Could not ${action} the service`,
      message: result.code === 0 ? undefined : result.stderr.trim() || `exit ${result.code}`,
    });
    setVersion((value) => value + 1);
  }

  async function useDevice(path: string): Promise<void> {
    if (!selected) return;
    try {
      const text = setSetting(readConfigText(selected), "device", path);
      await saveConfig(prefs, selected, text);
      const active = await systemctl(["is-active", prefs.serviceName]);
      if (active.code === 0) await systemctl(["restart", prefs.serviceName]);
      await showToast({
        style: Toast.Style.Success,
        title: "Device saved",
        message: active.code === 0 ? "Service restarted with the new device." : `Saved ${path}; it applies when the service starts.`,
      });
      setVersion((value) => value + 1);
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save the device",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }

  async function copyReport(): Promise<void> {
    if (!report) return;
    await Clipboard.copy(report.raw);
    await showToast({ style: Toast.Style.Success, title: "Diagnostics copied" });
  }

  const actions = (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => setVersion((value) => value + 1)} />
      <Action title="Reload Service" icon={Icon.Repeat} shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }} onAction={() => void serviceAction("reload")} />
      <Action title="Restart Service" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "r" }} onAction={() => void serviceAction("restart")} />
      <ActionPanel.Section title="Service">
        <Action title="Start Service" icon={Icon.Play} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "s" }} onAction={() => void serviceAction("start")} />
        <Action title="Stop Service" icon={Icon.Stop} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "x" }} onAction={() => void serviceAction("stop")} />
      </ActionPanel.Section>
      <ActionPanel.Section title="Diagnostics">
        <Action title="Copy Full Report" icon={Icon.CopyClipboard} shortcut="copy" onAction={() => void copyReport()} />
        <Action.RunInTerminal
          title="Open Service Logs"
          icon={Icon.Terminal}
          shortcut="open"
          args={["journalctl", "--user", "-u", prefs.serviceName, "-b", "-f"]}
          options={{ hold: true }}
        />
        <Action title="Settings" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl", "shift", "alt"], key: "," }} onAction={() => openCommand("settings")} />
        {selected && <Action.Open title="Open Config File" target={selected} icon={Icon.Pencil} shortcut="edit" />}
      </ActionPanel.Section>
    </ActionPanel>
  );

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

  if ((configsLoading || isLoading) && !report) {
    return <List isLoading searchBarPlaceholder="Checking edgepad" searchBarAccessory={configDropdown} />;
  }

  if (error !== "" || !report) {
    return (
      <List searchBarPlaceholder="Checking edgepad" searchBarAccessory={configDropdown}>
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="Could not run edgepad"
          description={error || "Select a config in the dropdown."}
          actions={actions}
        />
      </List>
    );
  }

  const summary = report.doctor.summary;
  const overallFail = (summary?.fail ?? 0) > 0 || report.status.result !== "running";
  const overallWarn = (summary?.warn ?? 0) > 0;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search checks, subjects or devices"
      searchBarAccessory={configDropdown}
      navigationTitle="Edgepad Health"
    >
      <List.Section title="Overall">
        <List.Item
          title={`Result: ${report.status.result ?? summary?.result ?? "unknown"}`}
          subtitle={
            summary
              ? `doctor: ${summary.ok} ok · ${summary.warn} warn · ${summary.fail} fail`
              : "doctor summary not found"
          }
          icon={overallFail ? Icon.XMarkCircle : overallWarn ? Icon.Warning : Icon.CheckCircle}
          accessories={[
            { tag: `${report.doctor.sections.reduce((sum, section) => sum + section.checks.length, 0)} checks` },
            { tag: `${report.devices.length} devices` },
          ]}
          actions={actions}
        />
      </List.Section>

      <List.Section title="Service and Config">
        {report.status.lines.map((line) => (
          <List.Item
            key={line.subject}
            title={line.subject}
            subtitle={line.detail}
            icon={statusIcon(line.detail)}
            actions={actions}
          />
        ))}
      </List.Section>

      {report.doctor.sections.map((section) => (
        <List.Section key={section.title} title={`Doctor · ${section.title}`}>
          {section.checks.map((check) => (
            <List.Item
              key={`${section.title}-${check.name}`}
              title={check.name}
              subtitle={check.detail}
              icon={SEVERITY_ICON[check.severity]}
              accessories={[{ tag: check.severity }]}
              actions={actions}
            />
          ))}
        </List.Section>
      ))}

      <List.Section title="Touchpads">
        {report.devices.length === 0 ? (
          <List.Item
            title="No readable touchpads"
            subtitle="Check that your user can open /dev/input/event*; doctor reports the access model."
            icon={Icon.Warning}
            actions={actions}
          />
        ) : (
          report.devices.map((device) => (
            <List.Item
              key={device.path}
              title={device.name || device.path}
              subtitle={[device.path, device.kind, device.rest].filter(Boolean).join(" · ")}
              icon={Icon.Mouse}
              accessories={[{ tag: device.kind ?? "device" }]}
              actions={
                <ActionPanel>
                  <Action title="Use as Device" icon={Icon.Checkmark} shortcut="open" onAction={() => void useDevice(device.path)} />
                  <Action.CopyToClipboard title="Copy Device Path" content={device.path} shortcut="copy" />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
