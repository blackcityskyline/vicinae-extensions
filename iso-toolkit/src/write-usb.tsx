import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listUsbDevices, type UsbDevice } from "~/lib/usb";
import VerifyIsoCommand from "~/verify-iso";

export default function WriteUsbCommand() {
  const [isoPath, setIsoPath] = useState<string[]>([]);
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [blockSize, setBlockSize] = useState("4M");

  useEffect(() => {
    setDevices(listUsbDevices());
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
          <Action.Push title="Verify ISO" target={<VerifyIsoCommand />} />
          <Action title="Eject Selected Device" onAction={async () => { const dev = device; if (!dev) return; await runInTerminal(["/bin/bash","-c",`for p in $(lsblk -ln -o NAME ${dev} | tail -n +2); do sudo umount /dev/$p 2>/dev/null || true; done; sudo umount ${dev} 2>/dev/null || true; sudo eject ${dev} 2>/dev/null || sudo udisksctl power-off -b ${dev}`], { hold: true }); }} />
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
      <Form.Description text="Destructive: all data on the target device will be overwritten." />
    </Form>
  );
}
