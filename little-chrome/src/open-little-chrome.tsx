import {
  Action,
  ActionPanel,
  Cache,
  closeMainWindow,
  Icon,
  launchCommand,
  LaunchType,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  type LaunchProps,
} from "@vicinae/api";
import { useEffect, useMemo, useRef, useState } from "react";

import { hasHistory } from "~/api/browser.ts";
import { loadBlocklist, saveBlocklist } from "~/api/hidden.ts";
import { searchHistory, type HistoryItem } from "~/api/history.ts";
import { openFromPreferences, resolveContext, type BrowserContext } from "~/api/open.ts";
import { hostOfHttp, isBlocked, type Blocklist } from "~/utils/blocklist.ts";
import { toUrl } from "~/utils/url.ts";

// One sqlite3 process per keystroke is wasteful; the first query of a launch is
// not delayed, because the list is empty until it returns.
const DEBOUNCE_MS = 150;

/** Last suggestions for an empty search, so reopening the command is instant. */
const cache = new Cache();

export default function Command(props: LaunchProps) {
  const resolved = useMemo(resolveContext, []);
  const [searchText, setSearchText] = useState(props.fallbackText ?? "");
  const [items, setItems] = useState<HistoryItem[]>(() => {
    if (props.fallbackText || !("context" in resolved)) return [];
    const cached = cache.get(cacheKey(resolved.context));
    return cached ? (JSON.parse(cached) as HistoryItem[]) : [];
  });
  const [blocklist, setBlocklist] = useState<Blocklist>();
  const [isLoading, setIsLoading] = useState(true);
  const firstQuery = useRef(true);

  const context = "context" in resolved ? resolved.context : undefined;
  const suggestionsAvailable = context !== undefined && hasHistory(context.dir, context.profile);

  useEffect(() => {
    if (!context) return;
    loadBlocklist(context.def.id, context.profile).then(setBlocklist);
  }, [context]);

  useEffect(() => {
    if (!context || !blocklist) return;
    if (!suggestionsAvailable) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const delay = firstQuery.current ? 0 : DEBOUNCE_MS;
    firstQuery.current = false;
    setIsLoading(true);
    const timer = setTimeout(() => {
      searchHistory(context.dir, context.profile, searchText, blocklist)
        .then((found) => {
          if (cancelled) return;
          setItems(found);
          if (!searchText.trim()) cache.set(cacheKey(context), JSON.stringify(found));
        })
        .catch((error: unknown) => {
          if (!cancelled) setItems([]);
          showToast({
            style: Toast.Style.Failure,
            title: "Could not read browser history",
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [context, blocklist, searchText, suggestionsAvailable]);

  async function updateBlocklist(next: Blocklist) {
    if (!context) return;
    await saveBlocklist(context.def.id, context.profile, next);
    setBlocklist(next);
    const cached = cache.get(cacheKey(context));
    if (cached) {
      const rows = JSON.parse(cached) as HistoryItem[];
      cache.set(cacheKey(context), JSON.stringify(rows.filter((row) => !isBlocked(row.url, next))));
    }
  }

  async function hide(next: Blocklist, title: string) {
    await updateBlocklist(next);
    await showToast({
      style: Toast.Style.Success,
      title,
      message: "Unhide it in Manage Hidden Suggestions",
    });
  }

  function actionPanel(url: string, hideable: boolean) {
    const host = hostOfHttp(url);
    return (
      <ActionPanel>
        <Action
          title="Open in Little Chrome"
          icon={Icon.AppWindow}
          onAction={async () => {
            const error = await openFromPreferences(url);
            if (error) {
              await showToast({ style: Toast.Style.Failure, title: "Could not open the window", message: error });
              return;
            }
            await closeMainWindow({ clearRootSearch: true });
          }}
        />
        <Action.CopyToClipboard title="Copy URL" content={url} />
        <ActionPanel.Section>
          {blocklist && hideable && (
            <Action
              title="Hide from Suggestions"
              icon={Icon.EyeDisabled}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => void hide({ ...blocklist, urls: [...blocklist.urls, url] }, "Hidden from suggestions")}
            />
          )}
          {blocklist && hideable && host !== undefined && (
            <Action
              title={`Hide All from ${host}`}
              icon={Icon.EyeDisabled}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
              onAction={() =>
                void hide({ ...blocklist, hosts: [...blocklist.hosts, host] }, `Hidden ${host} from suggestions`)
              }
            />
          )}
          <Action
            title="Manage Hidden Suggestions"
            icon={Icon.Eye}
            onAction={() => void launchCommand({ name: "manage-hidden", type: LaunchType.UserInitiated })}
          />
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  const typed = searchText.trim();
  const visible = blocklist ? items.filter((item) => !isBlocked(item.url, blocklist)) : [];

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

  return (
    <List
      isLoading={isLoading && suggestionsAvailable}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="URL or search"
    >
      <List.EmptyView
        icon={Icon.AppWindow}
        title={suggestionsAvailable ? "Type a URL or Search" : "No History Found"}
        description={
          suggestionsAvailable
            ? "Matches from your browser history appear here."
            : `${context.def.title} has no history at ${context.dir}. Open the browser once, or pick another one in the preferences.`
        }
        actions={
          <ActionPanel>
            <Action
              title="Manage Hidden Suggestions"
              icon={Icon.Eye}
              onAction={() => void launchCommand({ name: "manage-hidden", type: LaunchType.UserInitiated })}
            />
          </ActionPanel>
        }
      />
      {typed !== "" && (
        <List.Item
          id="typed"
          icon={Icon.AppWindow}
          title={typed}
          subtitle={toUrl(typed)}
          actions={actionPanel(toUrl(typed), false)}
        />
      )}
      <List.Section title="History">
        {visible.map((item) => (
          <List.Item
            key={item.url}
            id={item.url}
            icon={item.favicon ? { source: item.favicon, fallback: Icon.Clock } : Icon.Clock}
            title={item.title}
            subtitle={item.title === item.url ? undefined : item.url}
            actions={actionPanel(item.url, true)}
          />
        ))}
      </List.Section>
    </List>
  );
}

function cacheKey(context: BrowserContext): string {
  return `initial:${context.def.id}:${context.profile}`;
}
