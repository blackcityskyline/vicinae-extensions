import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useState } from "react";
import { buildKexecScript } from "~/lib/kexec";

export default function KexecIsoCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);
  const [safeGraphics, setSafeGraphics] = useState(false);

  const handleSubmit = async (values: Form.Values) => {
    const paths = (values.iso as string[]) ?? [];
    const selected = paths[0] ?? isoPath[0];
    if (!selected) {
      await showToast(Toast.Style.Failure, "Select an ISO file");
      return;
    }

    const args = safeGraphics ? [selected, "nomodeset"] : [selected];

    try {
      await runInTerminal(["/bin/bash", "-c", buildKexecScript(), "kexec-iso", ...args], { hold: true });
      await showToast(Toast.Style.Success, "kexec script started", selected);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to start kexec", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Boot ISO via kexec" shortcut={{ modifiers: ["ctrl"], key: "a" }} onSubmit={handleSubmit} />
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
      <Form.Checkbox
        id="safeGraphics"
        title="Safe graphics"
        label="Add nomodeset"
        info="Only if the screen stays dark without it: nomodeset stops the new kernel's native GPU driver."
        value={safeGraphics}
        onChange={setSafeGraphics}
      />
      <Form.Description text="Boots the ISO's kernel in place of this system and ends the current session. Save your work first." />
    </Form>
  );
}
