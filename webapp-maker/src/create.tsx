import { Form, ActionPanel, Action, showToast, Toast, getPreferenceValues, Icon } from "@vicinae/api";
import { useState } from "react";
import { createWebapp } from "~/api/webapp";

type Preferences = {
  browserBackend: string;
  envFile: string;
};

export default function CreateCommand() {
  const { browserBackend } = getPreferenceValues<Preferences>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [flags, setFlags] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [urlError, setUrlError] = useState<string | undefined>();

  async function handleSubmit() {
    setNameError(undefined);
    setUrlError(undefined);
    if (name.trim() === "") {
      setNameError("Name is required");
      return;
    }
    if (name.includes("/")) {
      setNameError("Name cannot contain \"/\"");
      return;
    }
    if (url.trim() === "") {
      setUrlError("URL is required");
      return;
    }

    setBusy(true);
    try {
      const result = await createWebapp({
        name,
        url,
        flags,
        icon,
        browserBackend: browserBackend || "auto",
      });
      if (result.ok) {
        await showToast(Toast.Style.Success, result.message);
        setName("");
        setUrl("");
        setFlags("");
        setIcon("");
      } else {
        await showToast(Toast.Style.Failure, result.message);
      }
    } catch (e) {
      await showToast(Toast.Style.Failure, String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Webapp" icon={Icon.Globe01} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="My web app"
        value={name}
        error={nameError}
        onChange={(v) => {
          setName(v);
          if (v.trim() !== "" && !v.includes("/")) setNameError(undefined);
          else if (v.includes("/")) setNameError("Name cannot contain \"/\"");
        }}
      />
      <Form.TextField
        id="url"
        title="URL"
        placeholder="example.com (https is added automatically)"
        value={url}
        error={urlError}
        onChange={(v) => {
          setUrl(v);
          if (v.trim() !== "") setUrlError(undefined);
        }}
      />
      <Form.TextField
        id="flags"
        title="Extra launch flags"
        placeholder="--incognito --proxy-server=..."
        value={flags}
        onChange={setFlags}
      />
      <Form.TextField
        id="icon"
        title="Icon (URL or file path)"
        placeholder="https://.../icon.png or /path/icon.png (empty = fetch from site)"
        value={icon}
        onChange={setIcon}
      />
    </Form>
  );
}
