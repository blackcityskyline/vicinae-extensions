import { Action, ActionPanel, Form, Toast, getPreferenceValues, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { ensureLauncher } from "~/api/launcher";
import { readWebapp, updateWebapp } from "~/api/webapp";
import { validateName, validateUrl } from "~/utils/webapp";

type Preferences = { envFile: string };

export default function EditWebapp({ name: original }: { name: string }) {
  const { pop } = useNavigation();
  const { envFile } = getPreferenceValues<Preferences>();
  const [name, setName] = useState(original);
  const [url, setUrl] = useState("");
  const [flags, setFlags] = useState("");
  const [icon, setIcon] = useState("");
  const [backend, setBackend] = useState("auto");
  const [busy, setBusy] = useState(true);
  const [nameError, setNameError] = useState<string>();
  const [urlError, setUrlError] = useState<string>();

  useEffect(() => {
    readWebapp(original)
      .then(async (config) => {
        if (!config) {
          await showToast(Toast.Style.Failure, `"${original}" is not a web app`);
          pop();
          return;
        }
        setUrl(config.url);
        setFlags(config.flags);
        setIcon(config.icon);
        setBackend(config.backend);
      })
      .catch((e) => showToast(Toast.Style.Failure, e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [original]);

  async function save() {
    const nameProblem = validateName(name) ?? undefined;
    const urlProblem = validateUrl(url) ?? undefined;
    setNameError(nameProblem);
    setUrlError(urlProblem);
    if (nameProblem || urlProblem) return;

    setBusy(true);
    try {
      const result = await updateWebapp(original, {
        name,
        url,
        flags,
        icon,
        backend,
        envFile: envFile ?? "",
        launcherPath: await ensureLauncher(),
      });
      await showToast(result.ok ? Toast.Style.Success : Toast.Style.Failure, result.message);
      if (result.ok) pop();
    } catch (e) {
      await showToast(Toast.Style.Failure, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle={`Edit ${original}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" shortcut="save" onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" value={name} error={nameError} onChange={setName} />
      <Form.TextField id="url" title="URL" value={url} error={urlError} onChange={setUrl} />
      <Form.TextField id="flags" title="Extra launch flags" value={flags} onChange={setFlags} />
      <Form.TextField
        id="icon"
        title="Icon"
        info="Change it to an address, a file or a theme icon name to replace the icon; leave it to keep the current one."
        value={icon}
        onChange={setIcon}
      />
      <Form.Dropdown id="backend" title="Browser Backend" value={backend} onChange={setBackend}>
        <Form.Dropdown.Item value="auto" title="Auto-detect" />
        <Form.Dropdown.Item value="helium" title="Helium" />
        <Form.Dropdown.Item value="chromium" title="Chromium" />
        <Form.Dropdown.Item value="thorium" title="Thorium" />
        <Form.Dropdown.Item value="brave" title="Brave" />
        <Form.Dropdown.Item value="chrome" title="Chrome" />
      </Form.Dropdown>
    </Form>
  );
}
