import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listUsbDevices, type UsbDevice } from "~/lib/usb";

export default function EjectUsbCommand() {
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<UsbDevice[]>([]);

  useEffect(() => {
    setDevices(listUsbDevices());
  }, []);

  const handleSubmit = async (values: Form.Values) => {
    const dev = (values.device as string) ?? device;
    if (!dev) {
      await showToast(Toast.Style.Failure, "Select a target device");
      return;
    }

    const script = [
      "set -e",
      `for p in $(lsblk -ln -o NAME ${dev} | tail -n +2); do sudo umount /dev/$p 2>/dev/null || true; done`,
      `sudo umount ${dev} 2>/dev/null || true`,
      `sudo eject ${dev} 2>/dev/null || sudo udisksctl power-off -b ${dev}`,
      'echo "Ejected."',
    ].join("\n");

    try {
      await runInTerminal(["/bin/bash", "-c", script], { hold: true });
      await showToast(Toast.Style.Success, "Eject started", dev);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to eject", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Eject / Unmount" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="device" title="Target device" value={device} onChange={setDevice}>
        {devices.length === 0 ? (
          <Form.Dropdown.Item title="No removable devices found" value="" />
        ) : (
          devices.map((d) => (
            <Form.Dropdown.Item key={d.path} title={`${d.path} (${d.size}) ${d.model}`} value={d.path} />
          ))
        )}
      </Form.Dropdown>
      <Form.Description text="Unmounts partitions and ejects/powers off the device." />
    </Form>
  );
}
