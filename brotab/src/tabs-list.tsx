import { Action, ActionPanel, closeMainWindow, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";

import { NoteForm } from "~/components/note-form";
import { run, type Screenshot } from "~/lib/cli";
import { startImageServer, type ImageServer } from "~/lib/image-server";
import { activateTab, closeTab, describeError, listTabs } from "~/lib/mediator";
import { brotabNgBinary } from "~/lib/preferences";
import type { Tab } from "~/lib/tabs";

/**
 * The screenshot of `tab`, taken only when one is asked for: `captureVisibleTab`
 * sees the selected tab of a window, so the add-on has to select the tab, wait
 * for it to paint and put the previous one back. That is not something to do for
 * every row on mount.
 *
 * The renderer loads markdown images over HTTP only, so the PNG the CLI wrote is
 * served from loopback for as long as the panel is open.
 */
function useScreenshot(tab: Tab | null): { source: string | null; error: string | null; reload: () => void } {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const server = useRef<ImageServer | null>(null);

  useEffect(() => {
    setSource(null);
    setError(null);
    if (tab === null) return;

    let live = true;
    startImageServer()
      .then(async (started) => {
        if (!live) {
          started.close();
          return;
        }
        server.current = started;
        const shot = await run<Screenshot>(brotabNgBinary(), ["screenshot", tab.id]);
        if (live) setSource(started.urlFor(shot.file));
      })
      .catch((failure: Error) => {
        if (live) setError(failure.message);
      });

    return () => {
      live = false;
      server.current?.close();
      server.current = null;
    };
  }, [tab?.id, attempt]);

  return { source, error, reload: () => setAttempt((count) => count + 1) };
}

export default function TabsList() {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<Tab | null>(null);
  const shot = useScreenshot(previewed);

  async function load(): Promise<void> {
    try {
      setTabs(await listTabs());
      setError(null);
    } catch (failure) {
      setTabs([]);
      setError(describeError(failure));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(command: (id: string) => Promise<void>, id: string): Promise<void> {
    try {
      await command(id);
    } catch (failure) {
      await showToast({ style: Toast.Style.Failure, title: "brotab failed", message: describeError(failure) });
    }
  }

  function actions(tab: Tab) {
    const showing = previewed?.id === tab.id;
    return (
      <ActionPanel>
        <Action
          title="Activate Tab"
          icon={Icon.ArrowRight}
          shortcut="open"
          onAction={async () => {
            await run(activateTab, tab.id);
            await closeMainWindow();
          }}
        />
        <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
        <Action
          title={showing ? "Hide Screenshot" : "Preview Screenshot"}
          icon={Icon.Eye}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
          onAction={() => setPreviewed(showing ? null : tab)}
        />
        {showing ? (
          <Action title="Refresh Screenshot" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={shot.reload} />
        ) : null}
        <Action.Push title="Note" icon={Icon.Pencil} shortcut="edit" target={<NoteForm url={tab.url} />} />
        <Action
          title="Close Tab"
          icon={Icon.XMarkCircle}
          shortcut="remove"
          onAction={async () => {
            await run(closeTab, tab.id);
            setTabs((current) => current?.filter((candidate) => candidate.id !== tab.id) ?? []);
          }}
        />
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
      </ActionPanel>
    );
  }

  function detail(tab: Tab) {
    if (previewed?.id !== tab.id) return undefined;
    const markdown =
      shot.error !== null
        ? `# Could not screenshot the page\n\n${shot.error}`
        : shot.source === null
          ? ""
          : `![](${shot.source})`;
    return <List.Item.Detail isLoading={shot.source === null && shot.error === null} markdown={markdown} />;
  }

  return (
    <List
      isLoading={tabs === null}
      isShowingDetail={previewed !== null}
      navigationTitle="Open Tabs"
      searchBarPlaceholder="Search open tabs"
      onSelectionChange={(id) => setPreviewed((current) => (current !== null && current.id !== id ? null : current))}
    >
      {error !== null ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="brotab is not reachable"
          description={error}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
            </ActionPanel>
          }
        />
      ) : tabs !== null && tabs.length === 0 ? (
        <List.EmptyView
          icon={Icon.Globe01}
          title="No tabs found"
          description="The browser is running, but its brotab extension reported no tabs."
        />
      ) : null}
      {(tabs ?? []).map((tab) => (
        <List.Item
          key={tab.id}
          id={tab.id}
          title={tab.title || tab.url}
          subtitle={tab.url}
          icon={tab.unloaded ? Icon.ArrowsContract : Icon.Globe01}
          keywords={[...(tab.unloaded ? ["unloaded", "discarded"] : []), tab.url]}
          accessories={tab.unloaded ? [{ tag: { value: "U" }, tooltip: "Unloaded from memory" }] : []}
          detail={detail(tab)}
          actions={actions(tab)}
        />
      ))}
    </List>
  );
}
