import { Form, ActionPanel, Action, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState, useEffect } from "react";
import { readWebappConfig, updateWebappConfig } from "~/api/webapp-edit";

type Props = {
  name: string;
};

export default function EditWebapp(props: Props) {
  const { pop } = useNavigation();
  const oldName = props.name;
  const [name, setName] = useState(props.name);
  const [url, setUrl] = useState("");
  const [flags, setFlags] = useState("");
  const [icon, setIcon] = useState("");
  const [backend, setBackend] = useState("auto");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    readWebappConfig(props.name).then((cfg) => {
      if (cfg) {
        setName(cfg.name);
        setUrl(cfg.url);
        setFlags(cfg.flags);
        setIcon(cfg.icon);
        setBackend(cfg.backend || "auto");
      }
      setBusy(false);
    });
  }, [props.name]);

  async function handleSubmit() {
    setBusy(true);
    try {
      const result = await updateWebappConfig({ name, url, flags, icon, backend }, oldName);
      if (result.ok) {
        await showToast(Toast.Style.Success, result.message);
        pop();
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
      navigationTitle={"Edit " + props.name}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" value={name} onChange={setName} />
      <Form.TextField id="url" title="URL" value={url} onChange={setUrl} />
      <Form.TextField id="flags" title="Extra launch flags" value={flags} onChange={setFlags} />
      <Form.TextField id="icon" title="Icon" value={icon} onChange={setIcon} />
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
