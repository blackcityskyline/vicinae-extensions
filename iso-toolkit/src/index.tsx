import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useState } from "react";
import fs from "node:fs";
import { buildGrubEntry, buildInstallScript, type Distro } from "~/lib/grub";

function grubPathFor(isoPath: string): string {
  const mounts = fs.readFileSync("/proc/mounts", "utf8").trim().split("\n");
  let best = "/";
  for (const line of mounts) {
    const parts = line.split(" ");
    const mp = parts[1];
    if (!mp) continue;
    const prefix = mp === "/" ? "/" : mp + "/";
    if (isoPath.startsWith(prefix) && mp.length > best.length) {
      best = mp;
    }
  }
  if (best === "/") return isoPath;
  const rel = isoPath.slice(best.length);
  return rel.startsWith("/") ? rel : "/" + rel;
}

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

    const grubIsoPath = grubPathFor(selected);
    const entryTitle =
      title.trim() || selected.split("/").pop()?.replace(/\.iso$/i, "") || "ISO";
    const entry = buildGrubEntry({ isoPath: grubIsoPath, title: entryTitle, distro });
    const script = buildInstallScript({ entry, reboot });

    try {
      await runInTerminal(["/bin/bash", "-c", script], { hold: true });
      await showToast(Toast.Style.Success, "GRUB loopback entry queued", `GRUB path: ${grubIsoPath}`);
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
        <Form.Dropdown.Item title="Auto (configfile)" value="auto" />
        <Form.Dropdown.Item title="Ubuntu / Debian (casper)" value="ubuntu" />
        <Form.Dropdown.Item title="Fedora (dracut)" value="fedora" />
        <Form.Dropdown.Item title="Arch Linux" value="arch" />
      </Form.Dropdown>
      <Form.Checkbox id="reboot" title="Reboot after install" value={reboot} onChange={setReboot} label="Reboot" />
    </Form>
  );
}
