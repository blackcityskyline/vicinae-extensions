import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  Keyboard,
  List,
  popToRoot,
  showToast,
  Toast,
} from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";

import { clearGpuPending, getStatus, setGpuMode } from "~/api/vectis";
import { reportResult } from "~/components/feedback";
import { GPU_APPLIES, GPU_DRIVERS, GPU_MODES, gpuSwitchOptions, modeSubtitle } from "~/utils/vectis";
import type { GpuMode, GpuSwitch } from "~/utils/vectis";

/**
 * The three GPU modes, plus cancelling a queued switch.
 *
 * `vectis gpu <mode>` queues the switch and applies it on the next logout or
 * boot; `--force` applies it now by stopping the display manager, which ends
 * every application in the session. Those are per-invocation choices, so they
 * sit in the search bar and stay put while the selection moves down the list.
 * Each is also a shortcut on the row, for when the setting is already right.
 */
export default function GpuModeList() {
  const { data: status, isLoading, error, revalidate } = useCachedPromise(getStatus);
  const [driver, setDriver] = useState(GPU_DRIVERS[0]?.value ?? "auto");
  const [apply, setApply] = useState(GPU_APPLIES[0]?.value ?? "queue");

  const options = gpuSwitchOptions(driver, apply);
  const current = status?.ok ? status.value.gpuMode : null;
  const pending = status?.ok ? status.value.gpuPending : null;

  function accessories(mode: GpuMode) {
    if (pending === mode.value) return [{ tag: { value: "queued", color: "Yellow" } }];
    if (current === mode.value) return [{ tag: { value: "active", color: "Green" } }];
    return [];
  }

  /** What Enter will do, which is not always "set this mode". */
  function primaryTitle(mode: GpuMode) {
    if (options === null) return "Set";
    return options.force ? `Switch to ${mode.title} now` : `Queue ${mode.title}`;
  }

  async function queue(mode: GpuMode, nouveau: boolean) {
    const result = await setGpuMode(mode.value, { nouveau });
    const reported = await reportResult(result, `GPU mode set to ${mode.value}`);
    if (reported) await revalidate();
    return reported;
  }

  async function forceNow(mode: GpuMode, nouveau: boolean) {
    const confirmed = await confirmAlert({
      title: `Switch to ${mode.title} now?`,
      message:
        "This stops the display manager and kills every application in your session, " +
        "including the launcher. Queue it instead to apply it on the next logout.",
      primaryAction: { title: "Switch now", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Queue it instead" },
    });

    if (!confirmed) {
      await queue(mode, nouveau);
      return;
    }

    const result = await setGpuMode(mode.value, { force: true, nouveau });
    if (await reportResult(result, `Switching to ${mode.title}`)) {
      await showToast({ style: Toast.Style.Animated, title: "Your session is about to end" });
    }
  }

  /**
   * The row's own Enter, plus its shortcuts.
   *
   * `cmd+n` and `cmd+f` are the CLI's `-n` and `-f` spelled as keys: the
   * selector may say "queue" but a switch wanted right now is one keystroke,
   * and a driver that only has to be chosen once should not need the dropdown
   * reset first.
   */
  function actionsFor(mode: GpuMode) {
    return (
      <ActionPanel>
        <Action
          title={primaryTitle(mode)}
          icon={options?.force ? Icon.Warning : Icon.Check}
          onAction={async () => {
            if (options === null) return;
            if (options.force) await forceNow(mode, options.nouveau);
            else await queue(mode, options.nouveau);
          }}
        />
        <Action
          title={`Switch to ${mode.title} Now`}
          icon={Icon.Bolt}
          shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
          onAction={() => forceNow(mode, options?.nouveau ?? false)}
        />
        <Action
          title={`Queue ${mode.title} with the nouveau Driver`}
          icon={Icon.Cog}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          onAction={() => queue(mode, true)}
        />
        <Action
          title={`Queue ${mode.title}`}
          icon={Icon.Check}
          shortcut={Keyboard.Shortcut.Common.Copy}
          onAction={() => queue(mode, false)}
        />
        <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
      </ActionPanel>
    );
  }

  async function cancelPending() {
    const result = await clearGpuPending();
    if (!result.ok) {
      await reportResult(result, "Could not cancel the queued switch");
      return;
    }
    await showToast({
      style: Toast.Style.Success,
      title: result.value ? "Queued switch cancelled" : "Nothing was queued",
      message: result.value ? `${pending} will not be applied on the next logout.` : undefined,
    });
    await revalidate();
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
          subtitle={modeSubtitle(mode, options as GpuSwitch | null)}
          keywords={mode.keywords}
          icon={mode.value === "integrated" ? Icon.Monitor : Icon.Power}
          accessories={accessories(mode)}
          actions={actionsFor(mode)}
        />
      ))}

      {/* A queued switch is state the daemon holds, not one of the three modes,
          so cancelling it cannot be an action on a mode row: there may be no
          such row to press it on once the mode is current. */}
      {pending !== null ? (
        <List.Item
          title={`Cancel Queued Switch to ${pending}`}
          subtitle={`${pending} is queued for the next logout. Cancelling keeps the GPU as it is now.`}
          keywords={["cancel", "queue", "pending", "undo", "revert", pending]}
          icon={Icon.XMarkCircle}
          accessories={[{ tag: { value: "queued", color: "Yellow" } }]}
          actions={
            <ActionPanel>
              <Action
                title={`Cancel the Queued Switch to ${pending}`}
                icon={Icon.XMarkCircle}
                onAction={cancelPending}
              />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
