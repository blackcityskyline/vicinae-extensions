import { Form, ActionPanel, Action, showToast, Toast, popToRoot, List, getPreferenceValues } from "@vicinae/api";
import { useState } from "react";
import { execFile } from "child_process";
import { parsePath, tildifyPath } from "./utils";

function updateToast(toast: Toast, style: Toast.Style, title: string, message?: string) {
  toast.style = style;
  toast.title = title;
  toast.message = message;
}

export default function CloneRepo() {
  const preferences = getPreferenceValues<Preferences>();
  const [dirs] = parsePath(preferences.repoScanPath);
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState(dirs[0] ?? "");
  const [error, setError] = useState<string | undefined>(undefined);

  if (dirs.length === 0) {
    return (
      <List>
        <List.EmptyView
          title="No Directories Configured"
          description="Make sure the scan path is configured in preferences and the directories exist."
        />
      </List>
    );
  }

  const submit = async () => {
    if (!url.trim()) {
      setError("This field is required");
      return;
    }
    setError(undefined);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Cloning…" });
    try {
      await new Promise<void>((resolve, reject) => {
        execFile("git", ["clone", url], { cwd: directory }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      updateToast(toast, Toast.Style.Success, "Cloned successfully");
      await popToRoot();
    } catch (err) {
      updateToast(toast, Toast.Style.Failure, "Clone failed", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Clone Repository" shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="Repository URL"
        placeholder="https://github.com/owner/repo.git"
        value={url}
        error={error}
        onChange={(value) => setUrl(value)}
      />
      <Form.Dropdown id="directory" title="Clone Into" value={directory} onChange={setDirectory}>
        {dirs.map((dir) => (
          <Form.Dropdown.Item key={dir} value={dir} title={tildifyPath(dir)} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
