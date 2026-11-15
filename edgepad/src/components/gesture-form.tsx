import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useMemo, useState } from "react";

import { parseArgv } from "../lib/argv";
import { applyConfig, readConfigText } from "../lib/cli";
import { getPrefs } from "../lib/prefs";
import {
  appendGesture,
  DIRECTIONS,
  parseConfig,
  replaceGesture,
  validateGesture,
  type Direction,
  type Gesture,
  type Zone,
  ZONES,
} from "../lib/toml";
import { directionLabel, zoneLabel } from "../lib/ui";

const FINGER_OPTIONS = ["any", "1", "2", "3", "4"] as const;

type Props = {
  configPath: string;
  /** Index and value of the binding being edited; omitted when adding. */
  existing?: { index: number; value: Gesture };
  onSaved?: () => void;
};

function directionsFor(zone: Zone): Direction[] {
  return zone === "pad" ? ["tap", "double-tap"] : [...DIRECTIONS];
}

export default function GestureForm({ configPath, existing, onSaved }: Props) {
  const prefs = useMemo(getPrefs, []);
  const { pop } = useNavigation();
  const [zone, setZone] = useState<Zone>(existing?.value.zone ?? "left");
  const [direction, setDirection] = useState<Direction>(existing?.value.direction ?? "tap");
  const [fingers, setFingers] = useState<string>(
    existing?.value.fingers === undefined ? "any" : String(existing.value.fingers),
  );
  const [logOnly, setLogOnly] = useState(existing?.value.action.kind === "log");
  const [command, setCommand] = useState(
    existing?.value.action.kind === "command" ? existing.value.action.argv.join(" ") : "",
  );
  const [problem, setProblem] = useState("");
  const [commandError, setCommandError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeZone(next: Zone) {
    setZone(next);
    setProblem("");
    if (!directionsFor(next).includes(direction)) setDirection("tap");
  }

  function build(): Gesture | string {
    let action: Gesture["action"];
    if (logOnly) {
      action = { kind: "log" };
    } else {
      try {
        const argv = parseArgv(command.trim());
        if (argv.length === 0) return "Type a command to run.";
        action = { kind: "command", argv };
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    return {
      zone,
      direction,
      fingers: fingers === "any" ? undefined : Number(fingers),
      action,
    };
  }

  async function submit(): Promise<boolean> {
    setProblem("");
    setCommandError("");
    const built = build();
    if (typeof built === "string") {
      setCommandError(built);
      return false;
    }

    setBusy(true);
    try {
      const text = readConfigText(configPath);
      const doc = parseConfig(text);
      const problem = validateGesture(doc, built, existing?.index);
      if (problem) {
        setProblem(problem);
        return false;
      }
      const next = existing ? replaceGesture(text, existing.index, built) : appendGesture(text, built);
      const note = await applyConfig(prefs, configPath, next);
      await showToast({
        style: Toast.Style.Success,
        title: existing ? "Gesture updated" : "Gesture added",
        message: note || `${zoneLabel(zone)} · ${directionLabel(direction)}`,
      });
      onSaved?.();
      pop();
      return true;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      navigationTitle={existing ? "Edit Gesture" : "Add Gesture"}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={existing ? "Save Gesture" : "Add Gesture"}
            icon={Icon.SaveDocument}
            shortcut="save"
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Config"
        text={`${configPath}\nSaved through edgepad status, then the running service is asked to reload.`}
      />
      <Form.Dropdown id="zone" title="Edge" value={zone} onChange={(value) => changeZone(value as Zone)}>
        {ZONES.map((value) => (
          <Form.Dropdown.Item key={value} title={zoneLabel(value)} value={value} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="direction" title="Gesture" value={direction} onChange={(value) => setDirection(value as Direction)}>
        {directionsFor(zone).map((value) => (
          <Form.Dropdown.Item key={value} title={directionLabel(value)} value={value} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="fingers" title="Fingers" value={fingers} onChange={setFingers}>
        {FINGER_OPTIONS.map((value) => (
          <Form.Dropdown.Item
            key={value}
            title={value === "any" ? "Any finger count" : `${value} finger${value === "1" ? "" : "s"} exactly`}
            value={value}
          />
        ))}
      </Form.Dropdown>
      <Form.Description
        title="Finger Count"
        text="Only the edge finger has to start in the band; the other fingers can rest anywhere on the pad."
      />
      <Form.Checkbox
        id="logOnly"
        title="Action"
        label="Log only (diagnostic)"
        value={logOnly}
        onChange={setLogOnly}
      />
      {!logOnly && (
        <Form.TextField
          id="command"
          title="Command"
          placeholder="wpctl set-volume @DEFAULT_SINK@ 1%+"
          info="Runs without a shell. Quote arguments that contain spaces."
          value={command}
          error={commandError}
          onChange={(value) => {
            setCommand(value);
            setCommandError("");
          }}
        />
      )}
      {problem !== "" && <Form.Description title="Problem" text={problem} />}
      <Form.Description
        title="Preview"
        text={`${zoneLabel(zone)} · ${directionLabel(direction)}${
          fingers === "any" ? "" : ` · ${fingers} finger${fingers === "1" ? "" : "s"}`
        } → ${logOnly ? "log the gesture" : command.trim() || "(no command yet)"}`}
      />
    </Form>
  );
}
