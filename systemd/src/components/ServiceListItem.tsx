import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback } from "react";

import { performServiceAction, type ServiceAction } from "../lib/systemctl";
import { ServiceStatus, type Service } from "../types";
import { getServiceColor } from "../utils";
import { ServiceDetail } from "./ServiceDetail";

// Service list item component
export function ServiceListItem({
  service,
  showingDetail,
  refreshServices,
  toggleDetails,
}: {
  service: Service;
  showingDetail: boolean;
  refreshServices: () => Promise<void>;
  toggleDetails: () => void;
}) {
  const tintColor = getServiceColor(service.status);

  const run = useCallback(
    async (action: ServiceAction) => {
      await performServiceAction(service, action);
      await refreshServices();
    },
    [service, refreshServices],
  );

  return (
    <List.Item
      key={service.name}
      title={service.name}
      subtitle={service.description}
      icon={{ source: service.icon, tintColor }}
      accessories={
        !showingDetail
          ? [
              {
                icon: service.type === "system" ? Icon.Cog : Icon.Person,
                tooltip: `${service.type} service`,
              },
            ]
          : undefined
      }
      detail={showingDetail ? <ServiceDetail service={service} /> : undefined}
      actions={
        <ActionPanel>
          <Action
            title={showingDetail ? "Hide Details" : "Show Details"}
            icon={showingDetail ? Icon.EyeDisabled : Icon.Eye}
            shortcut="open"
            onAction={toggleDetails}
          />
          {service.status === ServiceStatus.ACTIVE ? (
            <>
              <Action
                title="Stop"
                icon={Icon.Stop}
                style="destructive"
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={() => void run("stop")}
              />
              <Action
                title="Restart"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
                onAction={() => void run("restart")}
              />
              <Action
                title="Reload"
                icon={Icon.Repeat}
                shortcut={{ modifiers: ["ctrl"], key: "l" }}
                onAction={() => void run("reload")}
              />
            </>
          ) : (
            <Action
              title="Start"
              icon={Icon.Play}
              shortcut={{ modifiers: ["ctrl"], key: "s" }}
              onAction={() => void run("start")}
            />
          )}
          <ActionPanel.Section title="Boot">
            <Action
              title="Enable"
              icon={Icon.CheckCircle}
              shortcut={{ modifiers: ["ctrl"], key: "e" }}
              onAction={() => void run("enable")}
            />
            <Action
              title="Disable"
              icon={Icon.XMarkCircle}
              style="destructive"
              shortcut={{ modifiers: ["ctrl"], key: "d" }}
              onAction={() => void run("disable")}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
