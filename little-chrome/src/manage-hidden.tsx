import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { loadBlocklist, saveBlocklist } from "~/api/hidden.ts";
import { resolveContext } from "~/api/open.ts";
import { emptyBlocklist, withoutHost, withoutUrl, type Blocklist } from "~/utils/blocklist.ts";

function Row({
  value,
  icon,
  onUnhide,
  unhideAll,
}: {
  value: string;
  icon: Icon;
  onUnhide: () => void;
  unhideAll?: ReactNode;
}) {
  return (
    <List.Item
      icon={icon}
      title={value}
      actions={
        <ActionPanel>
          <Action title="Unhide" icon={Icon.Eye} onAction={onUnhide} />
          <Action.CopyToClipboard title="Copy" content={value} />
          {unhideAll}
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const resolved = useMemo(resolveContext, []);
  const context = "context" in resolved ? resolved.context : undefined;
  const [blocklist, setBlocklist] = useState<Blocklist>();

  useEffect(() => {
    if (!context) return;
    loadBlocklist(context.def.id, context.profile).then(setBlocklist);
  }, [context]);

  async function update(next: Blocklist) {
    if (!context) return;
    setBlocklist(next);
    await saveBlocklist(context.def.id, context.profile, next);
  }

  if (!context) {
    return (
      <List isLoading={false}>
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Browser Found"
          description={"error" in resolved ? resolved.error : ""}
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Cog} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const total = blocklist ? blocklist.urls.length + blocklist.hosts.length : 0;
  const unhideAll = blocklist && total > 0 && (
    <Action
      title="Unhide All"
      icon={Icon.Eye}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
      onAction={async () => {
        const confirmed = await confirmAlert({
          title: "Unhide all suggestions?",
          message: `${blocklist.urls.length} pages and ${blocklist.hosts.length} sites will appear again.`,
          primaryAction: { title: "Unhide All", style: Alert.ActionStyle.Destructive },
        });
        if (confirmed) {
          await update(emptyBlocklist());
          await showToast({ style: Toast.Style.Success, title: "All suggestions are visible again" });
        }
      }}
    />
  );

  return (
    <List isLoading={!blocklist} searchBarPlaceholder="Filter hidden suggestions">
      <List.EmptyView
        icon={Icon.Eye}
        title="No Hidden Suggestions"
        description="Hide a history suggestion with Ctrl+X (page) or Ctrl+Shift+X (site) in Open Little Chrome."
      />
      {blocklist && (
        <>
          <List.Section title="Sites" subtitle={String(blocklist.hosts.length)}>
            {blocklist.hosts.map((host) => (
              <Row
                key={host}
                value={host}
                icon={Icon.Globe01}
                onUnhide={() => void update(withoutHost(blocklist, host))}
                unhideAll={unhideAll}
              />
            ))}
          </List.Section>
          <List.Section title="Pages" subtitle={String(blocklist.urls.length)}>
            {blocklist.urls.map((url) => (
              <Row
                key={url}
                value={url}
                icon={Icon.BlankDocument}
                onUnhide={() => void update(withoutUrl(blocklist, url))}
                unhideAll={unhideAll}
              />
            ))}
          </List.Section>
        </>
      )}
    </List>
  );
}
