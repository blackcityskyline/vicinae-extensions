import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useState } from "react";
import { buildInstallScript, sanitizeTitle, type Distro } from "~/lib/grub";

export default function BootIsoCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [distro, setDistro] = useState<Distro>("auto");
  const [reboot, setReboot] = useState(false);

  const handleSubmit = async (values: Form.Values) => {
    const paths = (values.iso as string[]) ?? [];
    const selected = paths[0];
    if (!selected) {
      await showToast(Toast.Style.Failure, "Select an ISO file");
      return;
    }

    const entryTitle =
      sanitizeTitle(title) || sanitizeTitle(selected.split("/").pop()?.replace(/\.iso$/i, "") ?? "") || "ISO";
    const script = buildInstallScript({ distro, reboot });

    try {
      await runInTerminal(["/bin/bash", "-c", script, "grub-loopback", selected, entryTitle], { hold: true });
      await showToast(Toast.Style.Success, "GRUB loopback installer started", selected);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to start installer", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Install GRUB Entry" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="iso"
        title="ISO file"
        allowMultipleSelection={false}
        canChooseFiles
        canChooseDirectories={false}
        value={isoPath}
        onChange={setIsoPath}
      />
      <Form.TextField
        id="title"
        title="Menu title"
        placeholder="Auto from filename"
        value={title}
        onChange={setTitle}
      />
      <Form.Dropdown id="distro" title="Distro template" value={distro} onChange={(v) => setDistro(v as Distro)}>
        <Form.Dropdown.Item title="Auto (the ISO's loopback.cfg)" value="auto" />
        <Form.Dropdown.Item title="Ubuntu / Debian (casper)" value="ubuntu" />
        <Form.Dropdown.Item title="Fedora (dracut)" value="fedora" />
      </Form.Dropdown>
      <Form.Checkbox id="reboot" title="Reboot after install" value={reboot} onChange={setReboot} label="Reboot" />
    </Form>
  );
}
