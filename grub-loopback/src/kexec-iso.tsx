import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useState } from "react";
import { buildKexecScript } from "~/lib/kexec";
import fs from "node:fs";

export default function KexecIsoCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);

  const handleSubmit = async (values: Form.Values) => {
    const paths = (values.iso as string[]) ?? [];
    const selected = paths[0] ?? isoPath[0];
    if (!selected) {
      await showToast(Toast.Style.Failure, "Select an ISO file");
      return;
    }

    const script = buildKexecScript();
    const scriptPath = "/tmp/vicinae-kexec-iso.sh";
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });

    try {
      await runInTerminal(["/bin/bash", scriptPath, selected], { hold: true });
      await showToast(Toast.Style.Success, "kexec script started", selected);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to start kexec", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Boot ISO via kexec" onSubmit={handleSubmit} />
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
      <Form.Description text="This will kexec into the ISO live environment and kill the current session." />
    </Form>
  );
}
