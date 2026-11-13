import { Action, ActionPanel, Form, Icon, Toast, environment, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { cliPath, installApp, installLocations, type Locations } from "../appimage";

const script = cliPath(environment.assetsPath);

/** `~` for the home folder, because a dropdown row is narrow. */
function shorten(path: string): string {
  const home = process.env.HOME;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * The install card, as a form: a file from disk, a download URL, or a GitHub release.
 *
 * `add` reads the image's own `.desktop` file for its name, version and icon without running
 * it, so the name field is only an override.
 */
export function InstallForm({ onDone }: { onDone: () => void }) {
  const [locations, setLocations] = useState<Locations>();
  const [busy, setBusy] = useState(false);
  const { pop } = useNavigation();

  useEffect(() => {
    installLocations(script)
      .then(setLocations)
      .catch((cause: Error) => {
        void showToast({ style: Toast.Style.Failure, title: "Could not read the install folders", message: cause.message });
      });
  }, []);

  async function submit(values: Form.Values) {
    const picked = Array.isArray(values.file) ? values.file[0] : undefined;
    const file = picked === undefined ? undefined : String(picked);
    const source = String(values.source ?? "").trim();
    const chosen = source || file;
    if (!chosen) {
      await showToast({ style: Toast.Style.Failure, title: "Nothing to install", message: "Pick an AppImage file, or paste a URL or github:owner/repo." });
      return false;
    }
    const name = String(values.name ?? "").trim();
    const dir = String(values.dir ?? "");
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Installing",
      message: source ? source : file,
    });
    try {
      const outcome = await installApp(script, chosen, { name: name || undefined, dir: dir || undefined });
      toast.hide();
      if (!outcome.ok) {
        await showToast({ style: Toast.Style.Failure, title: "Could not install", message: outcome.error });
        return false;
      }
      await showToast({ style: Toast.Style.Success, title: "Installed", message: outcome.name ?? name ?? undefined });
      onDone();
      pop();
      return;
    } catch (cause) {
      toast.hide();
      await showToast({ style: Toast.Style.Failure, title: "Could not install", message: (cause as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy || !locations}
      navigationTitle="Install AppImage"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Install" icon={Icon.Download} onSubmit={submit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} shortcut={{ modifiers: ["ctrl"], key: "w" }} onAction={pop} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="AppImage File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        info="An .AppImage on disk. Its name, version and icon are read from the image itself; the file is not run until you open it."
      />
      <Form.TextField
        id="source"
        title="or URL / GitHub"
        placeholder="https://… or github:owner/repo"
        info="A direct download link, a repository's latest release, or a github.com link to either. Installing a GitHub release also sets up update checks for it."
      />
      <Form.TextField id="name" title="Name" placeholder="Optional: what to call it" info="Defaults to the name inside the AppImage." />
      <Form.Dropdown
        id="dir"
        title="Install to"
        defaultValue={locations?.default}
        info="Any folder inside your home. The choice is remembered for the next install."
      >
        {locations?.options.map((option) => (
          <Form.Dropdown.Item
            key={option.path}
            title={`${shorten(option.path)} (${option.apps})`}
            value={option.path}
            icon={Icon.Folder}
          />
        ))}
      </Form.Dropdown>
      <Form.Description
        title="Requirements"
        text="Reading an AppImage needs unsquashfs from squashfs-tools; without it an install stops with “missing dependency: unsquashfs”."
      />
    </Form>
  );
}
