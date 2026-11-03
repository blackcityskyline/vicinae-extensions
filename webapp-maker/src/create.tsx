import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast } from "@vicinae/api";
import { useState } from "react";
import { ensureLauncher } from "~/api/launcher";
import { createWebapp } from "~/api/webapp";
import { validateName, validateUrl } from "~/utils/webapp";

type Preferences = {
  browserBackend: string;
  envFile: string;
};

export default function CreateCommand() {
  const { browserBackend, envFile } = getPreferenceValues<Preferences>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [flags, setFlags] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [urlError, setUrlError] = useState<string>();

  async function submit() {
    const nameProblem = validateName(name) ?? undefined;
    const urlProblem = validateUrl(url) ?? undefined;
    setNameError(nameProblem);
    setUrlError(urlProblem);
    if (nameProblem || urlProblem) return;

    setBusy(true);
    try {
      const result = await createWebapp({
        name,
        url,
        flags,
        icon,
        backend: browserBackend || "auto",
        envFile: envFile ?? "",
        launcherPath: await ensureLauncher(),
      });
      await showToast(result.ok ? Toast.Style.Success : Toast.Style.Failure, result.message);
      if (result.ok) {
        setName("");
        setUrl("");
        setFlags("");
        setIcon("");
      }
    } catch (e) {
      await showToast(Toast.Style.Failure, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Webapp" icon={Icon.Globe01} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="My web app"
        value={name}
        error={nameError}
        onChange={(value) => {
          setName(value);
          setNameError(undefined);
        }}
      />
      <Form.TextField
        id="url"
        title="URL"
        placeholder="example.com (https is added automatically)"
        value={url}
        error={urlError}
        onChange={(value) => {
          setUrl(value);
          setUrlError(undefined);
        }}
      />
      <Form.TextField id="flags" title="Extra launch flags" placeholder="--incognito --proxy-server=..." value={flags} onChange={setFlags} />
      <Form.TextField
        id="icon"
        title="Icon"
        info="An address, a file on this machine, or a theme icon name. Empty fetches the site's own icon."
        placeholder="https://…/icon.png or /path/icon.png"
        value={icon}
        onChange={setIcon}
      />
    </Form>
  );
}
