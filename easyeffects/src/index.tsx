import { Action, ActionPanel, Icon, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { isRunning, loadPreset, openApp, quitApp, readOutput, readState, toggleBypass } from "~/api/easyeffects";
import { toastFailure, toastLoaded, toastStopped } from "~/api/toast";
import type { OutputInfo } from "~/utils/output";
import { STOPPED, type EffectsState } from "~/utils/state";

export default function Command() {
  const [state, setState] = useState<EffectsState>(STOPPED);
  const [output, setOutput] = useState<OutputInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextState, nextOutput] = await Promise.all([readState(), readOutput()]);
    setState(nextState);
    setOutput(nextOutput);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(): Promise<void> {
    try {
      const bypassed = await toggleBypass();
      if (bypassed === null) {
        toastStopped();
        return;
      }
      await refresh();
      void showToast({
        style: Toast.Style.Success,
        title: bypassed ? "Effects bypassed" : "Effects on",
        message: bypassed ? "Every effect is skipped until you turn it back on." : "The active preset is applied.",
      });
    } catch (error) {
      toastFailure(error);
    }
  }

  async function choose(name: string): Promise<void> {
    try {
      if (!(await loadPreset(name))) {
        toastStopped();
        return;
      }
      await refresh();
      toastLoaded(name);
    } catch (error) {
      toastFailure(error);
    }
  }

  function open(background: boolean): void {
    openApp(background, toastFailure);
    void waitForStart();
  }

  async function quit(force: boolean): Promise<void> {
    try {
      const gone = await quitApp(force);
      await refresh();
      if (!gone) {
        void showToast({
          style: Toast.Style.Failure,
          title: "Easy Effects is still running",
          message: force ? "It did not respond to the kill signal." : "Try Force Quit.",
        });
        return;
      }
      void showToast({
        style: Toast.Style.Success,
        title: force ? "Easy Effects killed" : "Easy Effects quit",
      });
    } catch (error) {
      toastFailure(error);
    }
  }

  /**
   * Starting Easy Effects takes a moment. Waiting here is bounded and only
   * happens after an explicit action, so the list never polls while idle.
   */
  async function waitForStart(): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (await isRunning()) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    await refresh();
  }

  const commonActions = (
    <>
      <Action
        title="Open Easy Effects"
        icon={Icon.AppWindow}
        shortcut={{ modifiers: ["ctrl"], key: "o" }}
        onAction={() => open(false)}
      />
      <Action
        title="Start in Background"
        icon={Icon.Minimize}
        shortcut={{ modifiers: ["ctrl"], key: "b" }}
        onAction={() => open(true)}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={() => void refresh()}
      />
      {state.running && (
        <>
          <Action
            title="Quit Easy Effects"
            icon={Icon.Xmark}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={() => void quit(false)}
          />
          <Action
            title="Force Quit"
            icon={Icon.XMarkCircle}
            shortcut={{ modifiers: ["ctrl"], key: "q" }}
            onAction={() => void quit(true)}
          />
        </>
      )}
    </>
  );

  return (
    <List isLoading={loading} searchBarPlaceholder="Search output presets">
      <List.Section title="Effects">
        {state.running ? (
          <List.Item
            title="Effects"
            subtitle={
              state.bypassed
                ? "Bypassed — audio passes through untouched"
                : "Active — the current preset is applied"
            }
            icon={state.bypassed ? Icon.Power : Icon.Waveform}
            accessories={[{ text: state.bypassed ? "Off" : "On" }]}
            actions={
              <ActionPanel>
                <Action
                  title="Toggle Effects"
                  icon={Icon.Power}
                  shortcut={{ modifiers: ["ctrl"], key: "t" }}
                  onAction={() => void toggle()}
                />
                {commonActions}
              </ActionPanel>
            }
          />
        ) : (
          <List.Item
            title="Easy Effects is not running"
            subtitle="Open it to see presets and switch effects"
            icon={Icon.Waveform}
            actions={
              <ActionPanel>
                <Action
                  title="Open Easy Effects"
                  icon={Icon.AppWindow}
                  shortcut={{ modifiers: ["ctrl"], key: "o" }}
                  onAction={() => open(false)}
                />
                <Action
                  title="Start in Background"
                  icon={Icon.Minimize}
                  shortcut={{ modifiers: ["ctrl"], key: "b" }}
                  onAction={() => open(true)}
                />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["ctrl"], key: "r" }}
                  onAction={() => void refresh()}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      {state.running && (
        <List.Section title="Output Presets" subtitle={state.preset ? `Current: ${state.preset}` : undefined}>
          {state.presets.length === 0 ? (
            <List.Item
              title="No output presets"
              subtitle="Create one in Easy Effects"
              icon={Icon.Waveform}
              actions={<ActionPanel>{commonActions}</ActionPanel>}
            />
          ) : (
            state.presets.map((preset) => (
              <List.Item
                key={preset}
                title={preset}
                icon={Icon.Waveform}
                accessories={preset === state.preset ? [{ text: "Active" }] : undefined}
                actions={
                  <ActionPanel>
                    <Action
                      title="Load Preset"
                      icon={Icon.Check}
                      shortcut={{ modifiers: ["ctrl"], key: "l" }}
                      onAction={() => void choose(preset)}
                    />
                    {commonActions}
                  </ActionPanel>
                }
              />
            ))
          )}
        </List.Section>
      )}

      {output && (
        <List.Section title="Output">
          <List.Item
            title={output.device ?? output.description}
            subtitle={
              output.device && output.device !== output.description
                ? output.description
                : output.address
                  ? "Bluetooth"
                  : "Default output"
            }
            icon={output.address ? Icon.Headphones : Icon.Speaker}
            accessories={output.battery === undefined ? undefined : [{ text: `${output.battery}%` }]}
            actions={<ActionPanel>{commonActions}</ActionPanel>}
          />
        </List.Section>
      )}
    </List>
  );
}
