import { Action, ActionPanel, Clipboard, closeMainWindow, Form, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { openInNvim } from "~/lib/open";
import { existingPaths, targetDirectory } from "~/lib/paths";
import { nvimPath, recentDirsFile } from "~/lib/preferences";
import { recordRecent } from "~/lib/sessions";

/**
 * Upstream reads the Finder selection, which `@vicinae/api` does not have: the
 * input is a picker, prefilled from paths on the clipboard. A `no-view` command
 * cannot read the clipboard at all, so this one is a `view`.
 */
export default function OpenWithNeovim() {
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void Clipboard.readText().then((text) => {
      const found = existingPaths(text);
      if (found.length > 0) setPaths(found);
    });
  }, []);

  async function submit(): Promise<boolean> {
    if (paths.length === 0) {
      setError("Choose at least one file or directory.");
      return false;
    }

    const first = paths[0] as string;
    try {
      await openInNvim(nvimPath(), paths, targetDirectory(first));
      recordRecent(first, recentDirsFile());
      await closeMainWindow();
      return true;
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open in Neovim",
        message: failure instanceof Error ? failure.message : String(failure),
      });
      return false;
    }
  }

  return (
    <Form
      navigationTitle="Open with Neovim"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open in Neovim" icon={Icon.Terminal} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="paths"
        title="Files or Directories"
        allowMultipleSelection
        canChooseFiles
        canChooseDirectories
        value={paths}
        error={error}
        onChange={(next) => {
          setPaths(next);
          setError(undefined);
        }}
      />
    </Form>
  );
}
