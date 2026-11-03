import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listUsbDevices, type UsbDevice, isMounted } from "~/lib/usb";
import { LocalStorage } from "@vicinae/api";

export default function WriteUsbCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [blockSize, setBlockSize] = useState("4M");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setDevices(listUsbDevices());
    (async () => {
      const lastIso = await LocalStorage.getItem<string>("lastIso");
      const lastDev = await LocalStorage.getItem<string>("lastDevice");
      if (lastIso) setIsoPath([lastIso]);
      if (lastDev) setDevice(lastDev);
    })();
  }, []);

  const handleSubmit = async (values: Form.Values) => {
    const paths = (values.iso as string[]) ?? [];
    const selected = paths[0] ?? isoPath[0];
    const dev = (values.device as string) ?? device;
    if (!selected) {
      await showToast(Toast.Style.Failure, "Select an ISO file");
      return;
    }
    if (!dev) {
      await showToast(Toast.Style.Failure, "Select a target device");
      return;
    }
    if (isMounted(dev)) {
      await showToast(Toast.Style.Failure, "Device is mounted. Unmount first.");
      return;
    }
    if (!confirm) {
      await showToast(Toast.Style.Failure, "Confirm destructive operation");
      return;
    }
    await LocalStorage.setItem("lastIso", selected);
    await LocalStorage.setItem("lastDevice", dev);
    const isoHist = JSON.parse((await LocalStorage.getItem<string>("isoHistory")) ?? "[]") as any;
    if (!isoHist.includes(selected)) isoHist.unshift(selected);
    await LocalStorage.setItem("isoHistory", JSON.stringify(isoHist.slice(0, 5)));
    const devHist = JSON.parse((await LocalStorage.getItem<string>("deviceHistory")) ?? "[]") as any;
    if (!devHist.includes(dev)) devHist.unshift(dev);
    await LocalStorage.setItem("deviceHistory", JSON.stringify(devHist.slice(0, 5)));

    const script = [
      "set -e",
      `echo "Writing ${selected} to ${dev}"`,
      `sudo dd if="${selected}" of="${dev}" bs=${blockSize} status=progress conv=fsync`,
      "sync",
      'echo "Done. You can remove the drive."',
    ].join("\n");

    try {
      await runInTerminal(["/bin/bash", "-c", script], { hold: true });
      await showToast(Toast.Style.Success, "USB write started", dev);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to start write", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Write ISO to USB" onSubmit={handleSubmit} />
          <Action title="Eject Device" onAction={async () => {
            const dev = device;
            if (!dev) return;
            await runInTerminal(["/bin/bash", "-c", `for p in $(lsblk -ln -o NAME ${dev} | tail -n +2); do sudo umount /dev/$p 2>/dev/null || true; done; sudo umount ${dev} 2>/dev/null || true; sudo eject ${dev} 2>/dev/null || sudo udisksctl power-off -b ${dev}`], { hold: true });
          }} />
          <Action title="Verify Written Image" onAction={async () => {
            const iso = isoPath[0];
            const dev = device;
            if (!iso || !dev) return;
            const script = `set -e; SIZE=$(stat -c%s "${iso}"); cmp -n "$SIZE" "${iso}" "${dev}" && echo "Verification OK: ISO matches device" || echo "Verification FAILED"`;
            await runInTerminal(["/bin/bash", "-c", script], { hold: true });
          }} />
          <Action.CopyToClipboard title="Copy Device Path" content={device} />
          <Action title="Show Device Info" onAction={async () => {
            const dev = device;
            if (!dev) return;
            await runInTerminal(["lsblk", "-o", "NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS", dev], { hold: true });
          }} />
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
      <Form.Dropdown id="device" title="Target device" value={device} onChange={setDevice}>
        {devices.length === 0 ? (
          <Form.Dropdown.Item title="No removable devices found" value="" />
        ) : (
          devices.map((d) => (
            <Form.Dropdown.Item
              key={d.path}
              title={`${d.path} (${d.size}) ${d.model}`}
              value={d.path}
            />
          ))
        )}
      </Form.Dropdown>
      <Form.Dropdown id="bs" title="Block size" value={blockSize} onChange={setBlockSize}>
        <Form.Dropdown.Item title="1M" value="1M" />
        <Form.Dropdown.Item title="4M" value="4M" />
        <Form.Dropdown.Item title="8M" value="8M" />
      </Form.Dropdown>
      <Form.Checkbox id="confirm" title="I understand this will erase the device" value={confirm} onChange={setConfirm} label="Confirm" />
      <Form.Description text="Destructive: all data on the target device will be overwritten." />
    </Form>
  );
}
