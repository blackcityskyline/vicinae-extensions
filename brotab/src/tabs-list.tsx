import { Action, ActionPanel, Cache, closeMainWindow, Icon, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";

import { NoteForm } from "~/components/note-form";
import { startImageServer, type ImageServer } from "~/lib/image-server";
import { activateTab, closeTab, describeError, listTabs, screenshot } from "~/lib/mediator";
import { previewMarkdown } from "~/lib/preview";
import type { Tab } from "~/lib/tabs";
import { freshScreenshot, rememberScreenshot, thumbnailFor } from "~/lib/thumbnails";

/**
 * The screenshot of `tab`, taken only while the preview is open. A cached
 * picture appears at once — even a day old — and a new one replaces it when the
 * add-on answers, so the pane is never empty and a slow or discarded tab does
 * not leave a blank frame. The cache is keyed by URL, so two rows of the same
 * page share one picture; a picture younger than `FRESH_MS` is not retaken.
 *
 * The add-on captures the tab itself without touching the selection, so the
 * page under the cursor is never brought to the front; a tab the browser has
 * unloaded from memory it reloads in the background first, which is the only
 * way that tab has a picture without being selected. Holding an arrow key would
 * start one capture per row, so a moved selection waits a moment before it is
 * taken, and only the latest selection may write its result.
 *
 * The renderer loads markdown images over HTTP only, so the PNG written to the
 * cache is served from loopback by one server kept for the whole view.
 */
function useScreenshot(tab: Tab | null): { source: string | null; error: string | null; reload: () => void } {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const server = useRef<ImageServer | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let live = true;
    startImageServer().then((started) => {
      if (!live) {
        started.close();
        return;
      }
      server.current = started;
      setReady(true);
    });
    return () => {
      live = false;
      server.current?.close();
      server.current = null;
    };
  }, []);

  const capture = useCallback(async (target: Tab, mine: number) => {
    const running = server.current;
    if (running === null) return;
    try {
      const shot = await screenshot(target.id);
      if (generation.current !== mine) return;
      const file = rememberScreenshot(target.url, shot.data);
      setSource(running.urlFor(file));
      setError(null);
    } catch (failure) {
      if (generation.current === mine) setError((failure as Error).message);
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    setError(null);
    if (tab === null || !ready) {
      setSource(null);
      return;
    }

    const cached = thumbnailFor(tab.url);
    setSource(cached === null ? null : server.current?.urlFor(cached) ?? null);
    if (cached !== null && freshScreenshot(cached)) return;

    const timer = setTimeout(() => void capture(tab, mine), 250);
    return () => clearTimeout(timer);
  }, [ready, tab?.id, tab?.url, capture]);

  return { source, error, reload: () => {
    if (tab !== null) void capture(tab, generation.current);
  } };
}

/** The mode outlives the window: it is what the list was last left in. */
const view = new Cache({ namespace: "tabs-list" });
const PREVIEW_KEY = "preview";

export default function TabsList() {
  const [tabs, setTabs] = useState<Tab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(() => view.get(PREVIEW_KEY) === "1");
  const [selected, setSelected] = useState<string | null>(null);
  // The pane follows the selection: whichever row is under the cursor is the tab
  // being screenshotted, so moving with the arrows switches the image too.
  const current = (tabs ?? []).find((tab) => tab.id === selected) ?? (tabs ?? [])[0] ?? null;
  const shot = useScreenshot(showPreview ? current : null);

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

  /**
   * Opening a tab is the one moment its frame is known to carry what the
   * content scripts did — a background frame can be the page's first paint,
   * taken before Dark Reader and its kin recoloured it. So the picture is taken
   * again here and kept for the list; nothing moves in the browser, the tab was
   * going to be shown anyway. The redraw lands about 120 ms after the tab is
   * drawn, and the window goes first so the action stays instant.
   */
  async function open(tab: Tab): Promise<void> {
    await run(activateTab, tab.id);
    await closeMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      rememberScreenshot(tab.url, (await screenshot(tab.id)).data);
    } catch {
      // The list keeps the picture it already had; the tab is open either way.
    }
  }

  function actions(tab: Tab) {
    return (
      <ActionPanel>
        <Action
          title="Activate Tab"
          icon={Icon.ArrowRight}
          shortcut="open"
          onAction={() => open(tab)}
        />
        <Action.CopyToClipboard title="Copy URL" content={tab.url} shortcut="copy" />
        <Action
          title={showPreview ? "Hide Preview" : "Show Preview"}
          icon={showPreview ? Icon.EyeDisabled : Icon.Eye}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
          onAction={() => {
            const next = !showPreview;
            view.set(PREVIEW_KEY, next ? "1" : "0");
            setShowPreview(next);
          }}
        />
        {showPreview ? (
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
    // Only the selected row carries the panel; every other row would show it too.
    if (current?.id !== tab.id) return undefined;
    const markdown = previewMarkdown(tab, shot.source, shot.error);
    const loading = shot.source === null && shot.error === null;
    return <List.Item.Detail isLoading={loading} markdown={markdown} />;
  }

  return (
    <List
      isLoading={tabs === null}
      isShowingDetail={showPreview && current !== null}
      navigationTitle="Open Tabs"
      searchBarPlaceholder="Search open tabs"
      onSelectionChange={setSelected}
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
