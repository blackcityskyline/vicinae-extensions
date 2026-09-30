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

import { getStatus, setGpuMode } from "~/api/vectis";
import { reportResult } from "~/components/feedback";
import { GPU_MODES } from "~/utils/vectis";
import type { GpuMode } from "~/utils/vectis";

/**
 * The three GPU modes.
 *
 * Switching the GPU is queued by default, because vectisd applies it on the next
 * logout or boot. Applying it immediately stops the display manager and kills
 * the session, so that is a separate action behind a confirmation rather than
 * the one Enter triggers.
 */
export default function GpuModeList() {
  const { data: status, isLoading, error, revalidate } = useCachedPromise(getStatus);
  const current = status?.ok ? status.value.gpuMode : null;
  const pending = status?.ok ? status.value.gpuPending : null;

  function accessories(mode: GpuMode) {
    if (pending === mode.value) return [{ tag: { value: "queued", color: "Yellow" } }];
    if (current === mode.value) return [{ tag: { value: "active", color: "Green" } }];
    return [];
  }

  async function queue(mode: GpuMode) {
    const result = await setGpuMode(mode.value);
    const reported = await reportResult(result, `GPU mode set to ${mode.value}`);
    if (reported) await revalidate();
    return reported;
  }

  async function applyNow(mode: GpuMode) {
    const confirmed = await confirmAlert({
      title: `Switch to ${mode.title} now?`,
      message:
        "This stops the display manager and kills every application in your session, " +
        "including the launcher. The switch applies on the next logout instead.",
      primaryAction: { title: "Switch now", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Queue it instead" },
    });
    if (!confirmed) {
      // The dismiss action is not a rejection: it is the safe path, offered
      // from the same dialog that offered the destructive one.
      await queue(mode);
      return;
    }

    const result = await setGpuMode(mode.value, { force: true });
    if (await reportResult(result, `Switching to ${mode.title}`)) {
      await showToast({ style: Toast.Style.Animated, title: "Your session is about to end" });
    }
  }

  async function useNouveau(mode: GpuMode) {
    const result = await setGpuMode(mode.value, { nouveau: true });
    await reportResult(result, `${mode.title} queued with the nouveau driver`);
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
    <List isLoading={isLoading} searchBarPlaceholder="Switch the GPU">
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
              <Action title={`Set ${mode.title}`} icon={Icon.Check} onAction={() => queue(mode)} />
              <Action
                title="Apply Now (ends the session)"
                icon={Icon.Warning}
                onAction={() => applyNow(mode)}
              />
              {mode.value !== "integrated" ? (
                <Action
                  title="Use the nouveau Driver"
                  icon={Icon.Cog}
                  onAction={() => useNouveau(mode)}
                />
              ) : null}
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}