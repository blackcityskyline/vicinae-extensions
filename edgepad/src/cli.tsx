import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  runInTerminal,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useMemo, useState } from "react";

import { resolveBinary, systemctl } from "./lib/cli";
import { getPrefs } from "./lib/prefs";
import { useConfigs } from "./lib/use-configs";

type Mode = "dump" | "proxy" | "replay" | "replay-raw" | "daemon";

const MODES: Mode[] = ["dump", "proxy", "replay", "replay-raw", "daemon"];

const MODE_LABEL: Record<Mode, string> = {
  dump: "Dump",
  proxy: "Proxy",
  replay: "Replay",
  "replay-raw": "Replay Raw",
  daemon: "Daemon",
};

const MODE_INFO: Record<Mode, string> = {
  dump: "Capture the touchpad's raw events into a fixture file. Stop the service first: it grabs the device.",
  proxy: "Run the gesture engine against the live device for a frame budget, without a service.",
  replay: "Feed a captured fixture back through the engine and print the gestures it recognises.",
  "replay-raw": "Like replay, for captures written without --raw (evdev frames).",
  daemon: "Run the daemon in the foreground with this config; useful while editing bindings.",
};

type Props = {
  mode: Mode;
  configPath?: string;
};

/** Parameter form for the commands that need one; the rest run from the list. */
export function CliForm({ mode: initialMode, configPath }: Props) {
  const prefs = useMemo(getPrefs, []);
  const { pop } = useNavigation();
  const binary = useMemo(() => {
    try {
      return resolveBinary(prefs);
    } catch {
      return "edgepad";
    }
  }, [prefs]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [device, setDevice] = useState("auto");
  const [out, setOut] = useState("");
  const [frames, setFrames] = useState("600");
  const [raw, setRaw] = useState(false);
  const [live, setLive] = useState(false);
  const [fixture, setFixture] = useState("");
  const [builtInDefaults, setBuiltInDefaults] = useState(false);
  const [problem, setProblem] = useState("");

  function build(): string[] | string {
    const config = builtInDefaults || !configPath ? ["--built-in-defaults"] : ["--config", configPath];
    switch (mode) {
      case "dump": {
        if (out.trim() === "") return "Give the capture a path, for example ~/edgepad-capture.ev.";
        const args = ["dump", "--device", device.trim() || "auto", "--out", out.trim()];
        if (frames.trim() !== "") args.push("--frames", frames.trim());
        if (raw) args.push("--raw");
        return args;
      }
      case "proxy": {
        const count = Number(frames);
        if (!Number.isInteger(count) || count <= 0) return "Frames must be a whole number greater than 0.";
        const args = ["proxy", "--frames", String(count)];
        args.push(live ? "--uinput" : "--dry-run");
        if (live) args.push("--grab");
        if (builtInDefaults || !configPath) args.push("--built-in-defaults");
        else args.push("--config", configPath);
        if (device.trim() !== "" && device.trim() !== "auto") args.push("--device", device.trim());
        return args;
      }
      case "replay":
      case "replay-raw": {
        if (fixture.trim() === "") return "Point at the fixture file to replay.";
        return [mode, fixture.trim(), ...config];
      }
      case "daemon": {
        if (builtInDefaults || !configPath) return ["daemon"];
        return ["daemon", "--config", configPath];
      }
    }
  }

  async function submit(): Promise<boolean> {
    setProblem("");
    const args = build();
    if (typeof args === "string") {
      setProblem(args);
      return false;
    }
    try {
      await runInTerminal([binary, ...args], { hold: true });
      pop();
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  const needsConfig = mode === "replay" || mode === "replay-raw" || mode === "proxy" || mode === "daemon";

  return (
    <Form
      navigationTitle={`edgepad ${MODE_LABEL[mode].toLowerCase()}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run in Terminal"
            icon={Icon.Terminal}
            shortcut="open"
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Command" text={MODE_INFO[mode]} />
      <Form.Dropdown id="mode" title="Subcommand" value={mode} onChange={(value) => setMode(value as Mode)}>
        {MODES.map((value) => (
          <Form.Dropdown.Item key={value} title={`edgepad ${value}`} value={value} icon={Icon.Terminal} />
        ))}
      </Form.Dropdown>

      {mode === "dump" && (
        <>
          <Form.TextField
            id="device"
            title="Device"
            placeholder="auto"
            info="auto picks the readable touchpad; or give an /dev/input/eventN path."
            value={device}
            onChange={setDevice}
          />
          <Form.TextField
            id="out"
            title="Output File"
            placeholder="~/edgepad-capture.ev"
            value={out}
            onChange={setOut}
          />
          <Form.TextField
            id="frames"
            title="Frames"
            placeholder="600"
            info="Stop after this many input frames; leave empty to capture until interrupted."
            value={frames}
            onChange={setFrames}
          />
          <Form.Checkbox
            id="raw"
            title="Format"
            label="Raw events (replay with replay-raw)"
            value={raw}
            onChange={setRaw}
          />
        </>
      )}

      {mode === "proxy" && (
        <>
          <Form.TextField id="frames" title="Frames" placeholder="600" value={frames} onChange={setFrames} />
          <Form.TextField id="device" title="Device" placeholder="auto" value={device} onChange={setDevice} />
          <Form.Checkbox
            id="live"
            title="Output"
            label="Uinput + grab (moves the real cursor)"
            info="Unchecked runs a dry run that only prints recognised gestures."
            value={live}
            onChange={setLive}
          />
        </>
      )}

      {(mode === "replay" || mode === "replay-raw") && (
        <Form.TextField
          id="fixture"
          title="Fixture"
          placeholder="~/edgepad-capture.ev"
          info="Absolute path to a file written by edgepad dump."
          value={fixture}
          onChange={setFixture}
        />
      )}

      {needsConfig && (
        <>
          <Form.Checkbox
            id="defaults"
            title="Config"
            label="Use built-in defaults instead of a config file"
            value={builtInDefaults}
            onChange={setBuiltInDefaults}
          />
          {!builtInDefaults && <Form.Description title="File" text={configPath ?? "No config selected."} />}
        </>
      )}

      {problem !== "" && <Form.Description title="Problem" text={problem} />}
    </Form>
  );
}

export default function Cli() {
  const prefs = useMemo(getPrefs, []);
  const { configs, selected, isLoading, select } = useConfigs();
  const binary = useMemo(() => {
    try {
      return resolveBinary(prefs);
    } catch {
      return "edgepad";
    }
  }, [prefs]);

  const withConfig = (command: string[]): string[] =>
    selected ? [...command, "--config", selected] : command;

  async function serviceAction(action: "reload" | "restart" | "start" | "stop"): Promise<void> {
    const result = await systemctl([action, prefs.serviceName]);
    const verb = { reload: "reloaded", restart: "restarted", start: "started", stop: "stopped" }[action];
    await showToast({
      style: result.code === 0 ? Toast.Style.Success : Toast.Style.Failure,
      title: result.code === 0 ? `Service ${verb}` : `Could not ${action} the service`,
      message: result.code === 0 ? undefined : result.stderr.trim() || `exit ${result.code}`,
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

  const run = (args: string[]) => (
    <Action.RunInTerminal title="Run in Terminal" icon={Icon.Terminal} shortcut="open" args={args} options={{ hold: true }} />
  );

  const pushForm = (mode: Mode) => (
    <Action.Push
      title={`${MODE_LABEL[mode]}…`}
      icon={Icon.Terminal}
      shortcut="open"
      target={<CliForm mode={mode} configPath={selected} />}
    />
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search edgepad commands"
      searchBarAccessory={configDropdown}
      navigationTitle="Edgepad CLI"
    >
      <List.Section title="Inspect">
        <List.Item
          title="Status"
          subtitle="Service, config, device, zones and action counts"
          icon={Icon.Gauge}
          actions={<ActionPanel>{run([binary, ...withConfig(["status"])])}</ActionPanel>}
        />
        <List.Item
          title="Doctor"
          subtitle="Structured access, session, device and service checks"
          icon={Icon.MedicalSupport}
          actions={<ActionPanel>{run([binary, ...withConfig(["doctor"])])}</ActionPanel>}
        />
        <List.Item
          title="Devices"
          subtitle="Touchpads edgepad can read"
          icon={Icon.Mouse}
          actions={<ActionPanel>{run([binary, "devices"])}</ActionPanel>}
        />
        <List.Item
          title="Version"
          subtitle="edgepad --version"
          icon={Icon.Circle}
          actions={<ActionPanel>{run([binary, "--version"])}</ActionPanel>}
        />
      </List.Section>

      <List.Section title="Capture and Replay">
        <List.Item
          title="Dump"
          subtitle="Capture the touchpad into a fixture"
          icon={Icon.Download}
          actions={<ActionPanel>{pushForm("dump")}</ActionPanel>}
        />
        <List.Item
          title="Proxy"
          subtitle="Run the engine against the live device for N frames"
          icon={Icon.Play}
          actions={<ActionPanel>{pushForm("proxy")}</ActionPanel>}
        />
        <List.Item
          title="Replay"
          subtitle="Feed a fixture back through the engine"
          icon={Icon.Repeat}
          actions={<ActionPanel>{pushForm("replay")}</ActionPanel>}
        />
        <List.Item
          title="Replay Raw"
          subtitle="Replay a capture made without --raw"
          icon={Icon.Repeat}
          actions={<ActionPanel>{pushForm("replay-raw")}</ActionPanel>}
        />
        <List.Item
          title="Daemon"
          subtitle="Run the daemon in the foreground with this config"
          icon={Icon.Terminal}
          actions={<ActionPanel>{pushForm("daemon")}</ActionPanel>}
        />
      </List.Section>

      <List.Section title="Service">
        <List.Item
          title="Reload Service"
          subtitle="Ask the daemon to reread its config"
          icon={Icon.Repeat}
          actions={
            <ActionPanel>
              <Action title="Reload" icon={Icon.Repeat} shortcut="open" onAction={() => void serviceAction("reload")} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Restart Service"
          subtitle="Needed after device or block-while-typing changes"
          icon={Icon.ArrowClockwise}
          actions={
            <ActionPanel>
              <Action title="Restart" icon={Icon.ArrowClockwise} shortcut="open" onAction={() => void serviceAction("restart")} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Start / Stop Service"
          subtitle={prefs.serviceName}
          icon={Icon.Power}
          actions={
            <ActionPanel>
              <Action title="Start" icon={Icon.Play} shortcut="open" onAction={() => void serviceAction("start")} />
              <Action title="Stop" icon={Icon.Stop} shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }} onAction={() => void serviceAction("stop")} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Service Logs"
          subtitle="journalctl --user -f"
          icon={Icon.Text}
          actions={
            <ActionPanel>
              <Action.RunInTerminal
                title="Follow Logs"
                icon={Icon.Terminal}
                shortcut="open"
                args={["journalctl", "--user", "-u", prefs.serviceName, "-b", "-f"]}
                options={{ hold: true }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
