import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  List,
  popToRoot,
  showToast,
  Toast,
} from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { getStatus, setGpuMode } from "~/api/vectis";
import { reportResult } from "~/components/feedback";
import { GPU_APPLIES, GPU_DRIVERS, GPU_MODES, gpuSwitchOptions } from "~/utils/vectis";
import type { GpuMode } from "~/utils/vectis";

/**
 * The three GPU modes, with the driver and the apply-timing chosen in the search
 * bar rather than buried in the action panel.
 *
 * `vectis gpu <mode>` queues the switch and applies it on the next logout or
 * boot; `--force` applies it now by stopping the display manager, which ends
 * every application in the session. That difference is a per-invocation choice,
 * not a per-mode one, so it belongs in a selector that stays put while the
 * selection moves down the list.
 */
export default function GpuModeList() {
  const { data: status, isLoading, error, revalidate } = useCachedPromise(getStatus);
  const [driver, setDriver] = useState(GPU_DRIVERS[0]?.value ?? "auto");
  const [apply, setApply] = useState(GPU_APPLIES[0]?.value ?? "queue");

  const options = gpuSwitchOptions(driver, apply);
  const current = status?.ok ? status.value.gpuMode : null;
  const pending = status?.ok ? status.value.gpuPending : null;
  const force = apply === "force";

  function accessories(mode: GpuMode) {
    if (pending === mode.value) return [{ tag: { value: "queued", color: "Yellow" } }];
    if (current === mode.value) return [{ tag: { value: "active", color: "Green" } }];
    return [];
  }

  function suffix(mode: GpuMode) {
    if (options === null) return "Set";
    return options.force ? `Switch to ${mode.title} now` : `Queue ${mode.title}`;
  }

  async function queue(mode: GpuMode, nouveau: boolean) {
    const result = await setGpuMode(mode.value, { nouveau });
    const reported = await reportResult(result, `GPU mode set to ${mode.value}`);
    if (reported) await revalidate();
    return reported;
  }

  /**
   * Enter on a mode applies whatever the selectors say.
   *
   * The confirmation stays even though the selector already says "Now": the
   * selector is easy to leave on by accident and the cost of being wrong is the
   * whole session. Declining queues the switch instead of doing nothing, since
   * that is almost always what was actually wanted.
   */
  async function applySelected(mode: GpuMode) {
    if (options === null) return;

    if (!options.force) {
      await queue(mode, options.nouveau);
      return;
    }

    const confirmed = await confirmAlert({
      title: `Switch to ${mode.title} now?`,
      message:
        "This stops the display manager and kills every application in your session, " +
        "including the launcher. Switch the selector back to Queue to apply it on the next logout instead.",
      primaryAction: { title: "Switch now", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Queue it instead" },
    });

    if (!confirmed) {
      await queue(mode, options.nouveau);
      return;
    }

    const result = await setGpuMode(mode.value, { force: true, nouveau: options.nouveau });
    if (await reportResult(result, `Switching to ${mode.title}`)) {
      await showToast({ style: Toast.Style.Animated, title: "Your session is about to end" });
    }
  }

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Vectis is unavailable"
          description="The vectis CLI could not be run. Open the main Vectis command for the full message."
          actions={
            <ActionPanel>
              <Action title="Back" icon={Icon.ArrowLeft} onAction={popToRoot} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Switch the GPU"
      searchBarAccessory={
        <>
          <List.Dropdown tooltip="Driver" value={driver} onChange={setDriver}>
            {GPU_DRIVERS.map((choice) => (
              <List.Dropdown.Item key={choice.value} value={choice.value} title={choice.title} />
            ))}
          </List.Dropdown>
          <List.Dropdown tooltip="When" value={apply} onChange={setApply}>
            {GPU_APPLIES.map((choice) => (
              <List.Dropdown.Item key={choice.value} value={choice.value} title={choice.title} />
            ))}
          </List.Dropdown>
        </>
      }
    >
      {GPU_MODES.map((mode) => (
        <List.Item
          key={mode.value}
          title={mode.title}
          subtitle={mode.description}
          keywords={mode.keywords}
          icon={mode.value === "integrated" ? Icon.Monitor : Icon.Power}
          accessories={accessories(mode)}
          actions={
            <ActionPanel>
              <Action
                title={suffix(mode)}
                icon={force ? Icon.Warning : Icon.Check}
                onAction={() => applySelected(mode)}
              />
              {options !== null && !options.force && options.nouveau ? (
                <Action
                  title={`Queue ${mode.title} with the nouveau Driver`}
                  icon={Icon.Cog}
                  onAction={() => queue(mode, true)}
                />
              ) : null}
              <Action
                title={`Queue ${mode.title}`}
                icon={Icon.Check}
                onAction={() => queue(mode, false)}
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
