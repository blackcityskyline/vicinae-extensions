import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";

import { getStatus, listGpuDevices } from "~/api/vectis";
import { gpuDevicesMarkdown, statusMarkdown } from "~/utils/vectis";

/**
 * Everything vectisd reports, plus the raw PCI listing.
 *
 * Both calls earn their place: `status` carries the daemon's own view of the
 * GPU, and `gpu-list` is the only thing that says which card is bound to a
 * driver right now, which is how a queued switch that never applied shows up.
 */
export default function StatusDetail() {
  const status = useCachedPromise(getStatus);
  const devices = useCachedPromise(listGpuDevices);

  const refresh = async () => {
    await Promise.all([status.revalidate(), devices.revalidate()]);
  };

  if (status.error || status.data?.ok === false) {
    const failure = status.data?.ok === false ? status.data.failure : undefined;
    return (
      <Detail
        markdown={`## Vectisd is unavailable\n\n${failure?.message ?? "The vectis CLI could not be run."}`}
        actions={
          <ActionPanel>
            <Action title="Try Again" icon={Icon.ArrowClockwise} onAction={refresh} />
          </ActionPanel>
        }
      />
    );
  }

  const daemon = status.data?.ok ? status.data.value : null;
  const cards = devices.data?.ok ? devices.data.value : [];

  const sections = [daemon ? statusMarkdown(daemon) : "", cards.length > 0 ? gpuDevicesMarkdown(cards) : ""]
    .filter((section) => section.length > 0)
    .join("\n\n");

  return (
    <Detail
      markdown={sections}
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
        </ActionPanel>
      }
    />
  );
}