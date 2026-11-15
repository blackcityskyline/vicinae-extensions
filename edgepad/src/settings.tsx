import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { applyConfig, readConfigText, saveConfig, systemctl } from "./lib/cli";
import { getPrefs } from "./lib/prefs";
import { parseConfig, setSetting, type ParsedConfig, type TomlValue } from "./lib/toml";
import { useConfigs } from "./lib/use-configs";

type Fields = {
  device: string;
  edgeWidth: string;
  leftWidth: string;
  rightWidth: string;
  topWidth: string;
  bottomWidth: string;
  tapMin: string;
  tapMax: string;
  swipeMin: string;
  doubleTimeout: string;
  doubleDistance: string;
  blockWhileTyping: boolean;
  blockTimeout: string;
  blockKeyboard: string;
  nice: string;
};

const DEFAULTS: Fields = {
  device: "auto",
  edgeWidth: "0.10",
  leftWidth: "",
  rightWidth: "",
  topWidth: "",
  bottomWidth: "",
  tapMin: "40",
  tapMax: "180",
  swipeMin: "0.02",
  doubleTimeout: "300",
  doubleDistance: "0.04",
  blockWhileTyping: false,
  blockTimeout: "500",
  blockKeyboard: "auto",
  nice: "-11",
};

function text(value: TomlValue | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  return String(value);
}

function fieldsFrom(doc: ParsedConfig): Fields {
  const get = (key: string) => doc.settings.get(key)?.value;
  return {
    device: text(get("device"), DEFAULTS.device),
    edgeWidth: text(get("edge_width"), DEFAULTS.edgeWidth),
    leftWidth: text(get("left_edge_width"), ""),
    rightWidth: text(get("right_edge_width"), ""),
    topWidth: text(get("top_edge_width"), ""),
    bottomWidth: text(get("bottom_edge_width"), ""),
    tapMin: text(get("tap_min_duration_ms"), DEFAULTS.tapMin),
    tapMax: text(get("tap_max_duration_ms"), DEFAULTS.tapMax),
    swipeMin: text(get("swipe_min_distance"), DEFAULTS.swipeMin),
    doubleTimeout: text(get("double_tap_timeout_ms"), DEFAULTS.doubleTimeout),
    doubleDistance: text(get("double_tap_max_distance"), DEFAULTS.doubleDistance),
    blockWhileTyping: get("block_while_typing") === true,
    blockTimeout: text(get("block_while_typing_timeout_ms"), DEFAULTS.blockTimeout),
    blockKeyboard: text(get("block_while_typing_keyboard"), DEFAULTS.blockKeyboard),
    nice: text(get("nice"), DEFAULTS.nice),
  };
}

function numberField(raw: string, label: string, valid: (value: number) => boolean, hint: string): number | string {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value) || !valid(value)) return `${label} must be ${hint}.`;
  return value;
}

export default function Settings() {
  const prefs = useMemo(getPrefs, []);
  const { pop } = useNavigation();
  const { configs, selected, isLoading, select } = useConfigs();
  const [fields, setFields] = useState<Fields>();
  const [original, setOriginal] = useState<Fields>();
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) {
      setFields(undefined);
      return;
    }
    try {
      const loaded = fieldsFrom(parseConfig(readConfigText(selected)));
      setFields(loaded);
      setOriginal(loaded);
      setProblem("");
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    }
  }, [selected]);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
    setProblem("");
  }

  async function submit(): Promise<boolean> {
    if (!selected || !fields) return false;
    setProblem("");

    const width = (raw: string, label: string) =>
      raw.trim() === "" ? undefined : numberField(raw, label, (value) => value > 0 && value < 0.5, "greater than 0 and less than 0.5");
    const numbers = {
      edgeWidth: width(fields.edgeWidth, "Edge width"),
      leftWidth: width(fields.leftWidth, "Left edge width"),
      rightWidth: width(fields.rightWidth, "Right edge width"),
      topWidth: width(fields.topWidth, "Top edge width"),
      bottomWidth: width(fields.bottomWidth, "Bottom edge width"),
      tapMin: numberField(fields.tapMin, "Tap minimum", (value) => value >= 0 && value <= 10_000, "between 0 and 10000 ms"),
      tapMax: numberField(fields.tapMax, "Tap maximum", (value) => value > 0 && value <= 10_000, "between 1 and 10000 ms"),
      swipeMin: numberField(fields.swipeMin, "Swipe minimum", (value) => value > 0 && value <= 1, "greater than 0 and at most 1"),
      doubleTimeout: numberField(fields.doubleTimeout, "Double tap timeout", (value) => value > 0 && value <= 10_000, "between 1 and 10000 ms"),
      doubleDistance: numberField(fields.doubleDistance, "Double tap distance", (value) => value > 0 && value <= 1, "greater than 0 and at most 1"),
      blockTimeout: numberField(fields.blockTimeout, "Block timeout", (value) => value > 0, "greater than 0 ms"),
      nice: numberField(fields.nice, "Nice", (value) => Number.isInteger(value) && value >= -20 && value <= 19, "a whole number from -20 to 19"),
    };
    const invalid = Object.values(numbers).find((value) => typeof value === "string");
    if (typeof invalid === "string") {
      setProblem(invalid);
      return false;
    }
    if (numbers.edgeWidth === undefined) {
      setProblem("Edge width must be greater than 0 and less than 0.5.");
      return false;
    }
    if ((numbers.tapMin as number) >= (numbers.tapMax as number)) {
      setProblem("Tap minimum must be lower than tap maximum.");
      return false;
    }
    if (fields.device.trim() === "") {
      setProblem("Device must be auto or an /dev/input/eventN path.");
      return false;
    }

    setBusy(true);
    try {
      let text = readConfigText(selected);
      const values: [string, TomlValue | undefined][] = [
        ["device", fields.device.trim()],
        ["edge_width", numbers.edgeWidth],
        ["left_edge_width", numbers.leftWidth],
        ["right_edge_width", numbers.rightWidth],
        ["top_edge_width", numbers.topWidth],
        ["bottom_edge_width", numbers.bottomWidth],
        ["tap_min_duration_ms", numbers.tapMin],
        ["tap_max_duration_ms", numbers.tapMax],
        ["swipe_min_distance", numbers.swipeMin],
        ["double_tap_timeout_ms", numbers.doubleTimeout],
        ["double_tap_max_distance", numbers.doubleDistance],
        ["block_while_typing", fields.blockWhileTyping],
        ["block_while_typing_timeout_ms", numbers.blockTimeout],
        ["block_while_typing_keyboard", fields.blockKeyboard.trim() || "auto"],
        ["nice", numbers.nice],
      ];
      for (const [key, value] of values) text = setSetting(text, key, value);

      const restart =
        original !== undefined &&
        (original.device !== fields.device.trim() ||
          original.blockWhileTyping !== fields.blockWhileTyping ||
          original.blockTimeout !== fields.blockTimeout ||
          original.blockKeyboard !== fields.blockKeyboard.trim());

      let note = "";
      if (restart) {
        await saveConfig(prefs, selected, text);
        const active = await systemctl(["is-active", prefs.serviceName]);
        if (active.code !== 0) {
          note = "Service is not running; the change applies when it starts.";
        } else {
          const result = await systemctl(["restart", prefs.serviceName]);
          note = result.code === 0 ? "Service restarted for the device/typing change." : `Saved, but the restart failed: ${result.stderr.trim()}`;
        }
      } else {
        note = await applyConfig(prefs, selected, text);
      }

      await showToast({ style: Toast.Style.Success, title: "Settings saved", message: note || undefined });
      pop();
      return true;
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const configDropdown = (
    <Form.Dropdown
      id="config"
      title="Config"
      value={selected}
      onChange={(value) => void select(value)}
      info="Every field below belongs to the selected file."
    >
      {configs.map((config) => (
        <Form.Dropdown.Item
          key={config.path}
          title={config.active ? `${config.name} (session)` : config.name}
          value={config.path}
          icon={config.active ? Icon.CheckCircle : Icon.Text}
        />
      ))}
    </Form.Dropdown>
  );

  return (
    <Form
      navigationTitle="Edgepad Settings"
      isLoading={isLoading || busy || fields === undefined}
      actions={
        <ActionPanel>
          {fields && (
            <Action.SubmitForm title="Save Settings" icon={Icon.SaveDocument} shortcut="save" onSubmit={submit} />
          )}
        </ActionPanel>
      }
    >
      {configDropdown}
      <Form.Description
        title="Save Behaviour"
        text="Device and block-while-typing changes restart the service; everything else reloads it. The file is only replaced after edgepad itself accepts it."
      />

      <Form.Description title="Device" text="Put these keys before any [[gestures]] or [[sliders]] table." />
      <Form.TextField
        id="device"
        title="Device"
        placeholder="auto"
        info="auto picks the only readable touchpad; otherwise use an /dev/input/eventN path."
        value={fields?.device ?? ""}
        onChange={(value) => set("device", value)}
      />
      <Form.TextField
        id="edgeWidth"
        title="Edge Width"
        placeholder="0.10"
        info="Fraction of the touchpad dimension reserved for each edge."
        value={fields?.edgeWidth ?? ""}
        onChange={(value) => set("edgeWidth", value)}
      />
      <Form.TextField id="leftWidth" title="Left Edge Width" placeholder="inherit" value={fields?.leftWidth ?? ""} onChange={(value) => set("leftWidth", value)} />
      <Form.TextField id="rightWidth" title="Right Edge Width" placeholder="inherit" value={fields?.rightWidth ?? ""} onChange={(value) => set("rightWidth", value)} />
      <Form.TextField id="topWidth" title="Top Edge Width" placeholder="inherit" value={fields?.topWidth ?? ""} onChange={(value) => set("topWidth", value)} />
      <Form.TextField id="bottomWidth" title="Bottom Edge Width" placeholder="inherit" value={fields?.bottomWidth ?? ""} onChange={(value) => set("bottomWidth", value)} />

      <Form.Description title="Tap and Swipe" text="Distances are fractions of the touchpad axes, not raw device units." />
      <Form.TextField id="tapMin" title="Tap Minimum (ms)" value={fields?.tapMin ?? ""} onChange={(value) => set("tapMin", value)} />
      <Form.TextField id="tapMax" title="Tap Maximum (ms)" value={fields?.tapMax ?? ""} onChange={(value) => set("tapMax", value)} />
      <Form.TextField id="swipeMin" title="Swipe Minimum" value={fields?.swipeMin ?? ""} onChange={(value) => set("swipeMin", value)} />
      <Form.TextField id="doubleTimeout" title="Double Tap Timeout (ms)" value={fields?.doubleTimeout ?? ""} onChange={(value) => set("doubleTimeout", value)} />
      <Form.TextField id="doubleDistance" title="Double Tap Distance" value={fields?.doubleDistance ?? ""} onChange={(value) => set("doubleDistance", value)} />

      <Form.Description title="Block While Typing" text="Suppresses edge actions for a moment after a keystroke. Requires a service restart." />
      <Form.Checkbox
        id="blockWhileTyping"
        title="Block While Typing"
        label="Ignore edge gestures and sliders right after typing"
        value={fields?.blockWhileTyping ?? false}
        onChange={(value) => set("blockWhileTyping", value)}
      />
      <Form.TextField id="blockTimeout" title="Block Timeout (ms)" value={fields?.blockTimeout ?? ""} onChange={(value) => set("blockTimeout", value)} />
      <Form.TextField
        id="blockKeyboard"
        title="Keyboard"
        placeholder="auto"
        info="auto watches every keyboard-like event node; or give one /dev/input/eventN path."
        value={fields?.blockKeyboard ?? ""}
        onChange={(value) => set("blockKeyboard", value)}
      />

      <Form.Description title="Scheduling" text="The niceness the daemon raises itself to at startup; it never lowers an already better priority." />
      <Form.TextField id="nice" title="Nice" placeholder="-11" value={fields?.nice ?? ""} onChange={(value) => set("nice", value)} />

      {problem !== "" && <Form.Description title="Problem" text={problem} />}
      {selected && <Form.Description title="File" text={selected} />}
    </Form>
  );
}
