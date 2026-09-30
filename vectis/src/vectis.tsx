import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";

import { applyProfile, getStatus } from "~/api/vectis";
import GpuModeList from "~/components/GpuModeList";
import StatusDetail from "~/components/StatusDetail";
import TdpForm from "~/components/TdpForm";
import { reportResult } from "~/components/feedback";
import { POWER_PROFILES } from "~/utils/vectis";
import type { DaemonStatus, PowerProfile } from "~/utils/vectis";

function statusSubtitle(status: DaemonStatus): string {
  const bits = [
    `Profile: ${status.activeProfile ?? "unknown"}`,
    `TDP: ${status.tdpPl1Watts ?? "?"}/${status.tdpPl2Watts ?? "?"} W`,
    `GPU: ${status.gpuMode ?? "unknown"} (${status.gpuPowerState})`,
  ];
  if (status.gpuPending !== null) bits.push(`queued: ${status.gpuPending}`);
  return bits.join("  ·  ");
}

function profileIcon(profile: PowerProfile) {
  if (profile.value === "powersave") return Icon.BatteryCharging;
  if (profile.value === "performance") return Icon.Rocket;
  return Icon.Gauge;
}

export default function VectisCommand() {
  const { data, isLoading, error, revalidate } = useCachedPromise(getStatus);

  // A missing CLI surfaces as a thrown error, a stopped daemon as a classified
  // failure. They need different messages, so they are not merged.
  const status = data?.ok ? data.value : null;
  const daemonFailure = data?.ok === false ? data.failure : null;

  if (error || daemonFailure) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title={error ? "Vectis is not installed" : "Vectisd is not answering"}
          description={
            error?.message ??
            daemonFailure?.message ??
            "Build vectis with 'cargo build --release --workspace' and install it into /usr/local/bin."
          }
          actions={
            <ActionPanel>
              <Action title="Try Again" icon={Icon.ArrowClockwise} onAction={revalidate} />
              <Action.Push title="Open Status" icon={Icon.Info01} target={<StatusDetail />} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Power and GPU">
      <List.Section title="Power Profile" subtitle={status ? statusSubtitle(status) : undefined}>
        {POWER_PROFILES.map((profile) => (
          <List.Item
            key={profile.value}
            title={`Set ${profile.title}`}
            subtitle={profile.description}
            keywords={profile.keywords}
            icon={profileIcon(profile)}
            accessories={
              status?.activeProfile === profile.value ? [{ tag: { value: "active", color: "Green" } }] : []
            }
            actions={
              <ActionPanel>
                <Action
                  title={`Set ${profile.title}`}
                  icon={Icon.Check}
                  onAction={async () => {
                    const result = await applyProfile(profile.value);
                    if (await reportResult(result, `Profile set to ${profile.value}`)) await revalidate();
                  }}
                />
                <Action.Push title="Show Status" icon={Icon.Info01} target={<StatusDetail />} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="GPU">
        <List.Item
          title="GPU Mode"
          subtitle={
            status
              ? `Now ${status.gpuMode ?? "unknown"} (${status.gpuPowerState})` +
                (status.gpuPending ? `, queued: ${status.gpuPending}` : "")
              : "Integrated, hybrid or discrete"
          }
          icon={Icon.Power}
          accessories={
            status?.gpuPending ? [{ tag: { value: `queued: ${status.gpuPending}`, color: "Yellow" } }] : []
          }
          actions={
            <ActionPanel>
              <Action.Push title="GPU Mode" icon={Icon.Power} target={<GpuModeList />} />
              <Action.Push title="Show Status" icon={Icon.Info01} target={<StatusDetail />} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Power Limit" subtitle="Hard RAPL cap, independent of the profile">
        <List.Item
          title="Set Power Limit"
          subtitle="Cap sustained and boost watts, or lock them together"
          icon={Icon.LightBulb}
          accessories={
            status?.tdpPl1Watts
              ? [{ text: `${status.tdpPl1Watts} / ${status.tdpPl2Watts ?? "?"} W` }]
              : [{ tag: { value: "uncapped", color: "Gray" } }]
          }
          actions={
            <ActionPanel>
              <Action.Push
                title="Set Power Limit"
                icon={Icon.LightBulb}
                target={<TdpForm onSaved={revalidate} />}
              />
              <Action.Push title="Show Status" icon={Icon.Info01} target={<StatusDetail />} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Diagnostics">
        <List.Item
          title="Status"
          subtitle="Profile, TDP, GPU mode, conflicting services and the PCI devices"
          icon={Icon.Info01}
          actions={
            <ActionPanel>
              <Action.Push title="Status" icon={Icon.Info01} target={<StatusDetail />} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}