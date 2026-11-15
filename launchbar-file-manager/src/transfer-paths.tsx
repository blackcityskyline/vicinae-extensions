import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  getPreferenceValues,
} from "@vicinae/api";
import { usePromise } from "@raycast/utils";
import { clipboardPaths, existingPaths } from "./clipboard-paths";
import { expandHome } from "./fs-utils";
import { TransferTree } from "./transfer-tree";

function getPrefs(): Preferences {
  try {
    return getPreferenceValues<Preferences>();
  } catch {
    return {
      startingPath: "~",
      startBehavior: "start",
      showHiddenDefault: false,
      transferStart: "home",
    } as Preferences;
  }
}

/**
 * Transfer the paths on the clipboard.
 *
 * Raycast read the Finder selection here; no Linux file manager exposes its
 * selection to another process, so this takes the paths a "copy" put on the
 * clipboard instead — the same URIs Nautilus and Dolphin write. The transfer
 * tree is the same one Tab opens in the browser, with the basket left alone.
 */
export default function Command() {
  const p = getPrefs();
  const home = expandHome(p.startingPath || "~");

  const { data, isLoading, revalidate } = usePromise(async () => {
    // Vicinae hands over the real file list when the source put URLs on the
    // clipboard; the text form is the fallback for a plain path list.
    const { text, urls } = await Clipboard.read();
    const lines = [...(urls ?? []), text ?? ""].join("\n");
    return existingPaths(clipboardPaths(lines));
  }, []);

  if (isLoading) {
    return <List isLoading={true} searchBarPlaceholder="Reading clipboard…" />;
  }

  if (!data || data.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Folder}
          title="No paths on the clipboard"
          description="Copy files in your file manager, then run this again"
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.RotateClockwise}
                shortcut="refresh"
                onAction={() => revalidate()}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <TransferTree
      sources={data}
      initialPath={home}
      showHidden={!!p.showHiddenDefault}
      onDone={() => undefined}
      manageBasket={false}
      isRootView
    />
  );
}
