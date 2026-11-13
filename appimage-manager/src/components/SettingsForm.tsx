import { Action, ActionPanel, Form, Icon, Toast, environment, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import {
  appSettings,
  cliPath,
  installLocations,
  resolveSource,
  saveSettings,
  type AppImageSettings,
  type Locations,
} from "../appimage";

const script = cliPath(environment.assetsPath);

function shorten(path: string): string {
  const home = process.env.HOME;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * One app's settings: the same five things the plugin's settings window offers, over `set`.
 *
 * Every field is written on save, including the empty ones — clearing the launch arguments has
 * to remove them from the launcher entry, not leave the old ones in place.
 */
export function SettingsForm({ id, name, onSaved }: { id: string; name: string; onSaved: () => void }) {
  const [settings, setSettings] = useState<AppImageSettings>();
  const [locations, setLocations] = useState<Locations>();
  const [busy, setBusy] = useState(false);
  const { pop } = useNavigation();

  useEffect(() => {
    Promise.all([appSettings(script, id), installLocations(script)])
      .then(([next, folders]) => {
        setSettings(next);
        setLocations(folders);
      })
      .catch((cause: Error) => {
        void showToast({ style: Toast.Style.Failure, title: `Could not read ${name}`, message: cause.message });
        pop();
      });
  }, [id, name]);

  async function submit(values: Form.Values) {
    const nextName = String(values.name ?? "").trim();
    if (!nextName) {
      await showToast({ style: Toast.Style.Failure, title: "A name is required" });
      return false;
    }
    const source = String(values.source ?? "").trim();
    if (source) {
      // The same check the plugin does while typing: the latest release must have an AppImage
      // for this CPU, otherwise the update would later fail with nothing to show for it.
      const resolved = await resolveSource(script, source);
      if (!resolved.ok) {
        await showToast({ style: Toast.Style.Failure, title: "That update source cannot be used", message: resolved.error });
        return false;
      }
    }
    const dir = String(values.dir ?? "");
    setBusy(true);
    try {
      const outcome = await saveSettings(script, id, {
        name: nextName,
        ...(settings && dir && dir !== settings.dir ? { dir } : {}),
        args: String(values.args ?? "").trim(),
        source,
        hidden: values.hidden === true,
      });
      if (!outcome.ok) {
        await showToast({ style: Toast.Style.Failure, title: "Could not save", message: outcome.error });
        return false;
      }
      await showToast({ style: Toast.Style.Success, title: "Saved", message: nextName });
      onSaved();
      pop();
      return;
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not save", message: (cause as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Fields are rendered only once the values are known: `defaultValue` is read when a field
  // mounts, so mounting them against an empty form would show (and then save) blank settings.
  if (!settings) return <Form isLoading />;

  const folderPaths = [...new Set([settings.dir, ...(locations?.options.map((option) => option.path) ?? [])])];

  return (
    <Form
      isLoading={busy}
      navigationTitle={`${name} Settings`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" icon={Icon.CheckCircle} onSubmit={submit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} shortcut={{ modifiers: ["ctrl"], key: "w" }} onAction={pop} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={settings?.name} />
      <Form.TextField
        id="args"
        title="Launch Options"
        defaultValue={settings?.args}
        placeholder="--ozone-platform=wayland --no-sandbox"
        info="Extra arguments in the launcher entry. Clearing this removes them."
      />
      <Form.TextField
        id="source"
        title="Update Source"
        defaultValue={settings?.sourceKind === "github" ? settings.repo : ""}
        placeholder="owner/repo"
        info="GitHub repository to check for releases. Empty means no updates."
      />
      <Form.Checkbox
        id="hidden"
        title="App Launcher"
        label="Show in the app launcher"
        defaultValue={settings ? !settings.hidden : true}
      />
      <Form.Dropdown id="dir" title="Location" defaultValue={settings?.dir}>
        {folderPaths.map((path) => (
          <Form.Dropdown.Item key={path} title={shorten(path)} value={path} icon={Icon.Folder} />
        ))}
      </Form.Dropdown>
      <Form.Description text={settings.external ? `${settings.path} — added by another launcher` : settings.path} />
    </Form>
  );
}
