import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useMemo, useState } from "react";

import { formatArgv, parseArgv } from "../lib/argv";
import { applyConfig, readConfigText } from "../lib/cli";
import { getPrefs } from "../lib/prefs";
import {
  appendSlider,
  EDGE_ZONES,
  parseConfig,
  replaceSlider,
  validateSlider,
  type EdgeZone,
  type Slider,
} from "../lib/toml";
import { zoneLabel } from "../lib/ui";

type Props = {
  configPath: string;
  existing?: { index: number; value: Slider };
  onSaved?: () => void;
};

function axisOf(zone: EdgeZone): "vertical" | "horizontal" {
  return zone === "left" || zone === "right" ? "vertical" : "horizontal";
}

export default function SliderForm({ configPath, existing, onSaved }: Props) {
  const prefs = useMemo(getPrefs, []);
  const { pop } = useNavigation();
  const [zone, setZone] = useState<EdgeZone>(existing?.value.zone ?? "left");
  const [step, setStep] = useState(String(existing?.value.step ?? 0.04));
  const [up, setUp] = useState(existing?.value.up ? formatArgv(existing.value.up) : "");
  const [down, setDown] = useState(existing?.value.down ? formatArgv(existing.value.down) : "");
  const [left, setLeft] = useState(existing?.value.left ? formatArgv(existing.value.left) : "");
  const [right, setRight] = useState(existing?.value.right ? formatArgv(existing.value.right) : "");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const axis = axisOf(zone);

  function command(input: string, field: string): string[] | string {
    try {
      const argv = parseArgv(input.trim());
      if (argv.length === 0) return `The ${field} command needs a program to run.`;
      return argv;
    } catch (error) {
      return `${field}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function build(): Slider | string {
    const parsedStep = Number(step);
    const slider: Slider = { zone, step: parsedStep };
    const pairs = axis === "vertical" ? [["up", up], ["down", down]] : [["left", left], ["right", right]];
    for (const [field, input] of pairs as [string, string][]) {
      const parsed = command(input, field);
      if (typeof parsed === "string") return parsed;
      if (field === "up") slider.up = parsed;
      if (field === "down") slider.down = parsed;
      if (field === "left") slider.left = parsed;
      if (field === "right") slider.right = parsed;
    }
    return slider;
  }

  async function submit(): Promise<boolean> {
    setProblem("");
    const built = build();
    if (typeof built === "string") {
      setProblem(built);
      return false;
    }

    setBusy(true);
    try {
      const text = readConfigText(configPath);
      const doc = parseConfig(text);
      const problem = validateSlider(doc, built, existing?.index);
      if (problem) {
        setProblem(problem);
        return false;
      }
      const next = existing ? replaceSlider(text, existing.index, built) : appendSlider(text, built);
      const note = await applyConfig(prefs, configPath, next);
      await showToast({
        style: Toast.Style.Success,
        title: existing ? "Slider updated" : "Slider added",
        message: note || `${zoneLabel(zone)} · step ${built.step}`,
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
      navigationTitle={existing ? "Edit Slider" : "Add Slider"}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={existing ? "Save Slider" : "Add Slider"}
            icon={Icon.SaveDocument}
            shortcut="save"
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Slider"
        text="A slider repeats a command while your finger moves along the edge. Left and right edges use up/down; top and bottom use left/right."
      />
      <Form.Dropdown id="zone" title="Edge" value={zone} onChange={(value) => setZone(value as EdgeZone)}>
        {EDGE_ZONES.map((value) => (
          <Form.Dropdown.Item key={value} title={zoneLabel(value)} value={value} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="step"
        title="Step"
        placeholder="0.04"
        info="Distance between actions as a fraction of the axis. Smaller means more steps."
        value={step}
        onChange={setStep}
      />
      {axis === "vertical" ? (
        <>
          <Form.TextField id="up" title="Up Command" placeholder="brightnessctl set 1%+" value={up} onChange={setUp} />
          <Form.TextField id="down" title="Down Command" placeholder="brightnessctl set 1%-" value={down} onChange={setDown} />
        </>
      ) : (
        <>
          <Form.TextField id="left" title="Left Command" placeholder="playerctl previous" value={left} onChange={setLeft} />
          <Form.TextField id="right" title="Right Command" placeholder="playerctl next" value={right} onChange={setRight} />
        </>
      )}
      {problem !== "" && <Form.Description title="Problem" text={problem} />}
    </Form>
  );
}
