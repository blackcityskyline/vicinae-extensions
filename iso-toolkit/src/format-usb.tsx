import { Action, ActionPanel, Form, Toast, showToast, runInTerminal } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listUsbDevices, type UsbDevice, isMounted } from "~/lib/usb";
import { LocalStorage } from "@vicinae/api";

const FILESYSTEMS = [
  { value: "vfat", label: "FAT32 (vfat)" },
  { value: "exfat", label: "exFAT" },
  { value: "ntfs", label: "NTFS" },
  { value: "ext4", label: "ext4" },
];

export default function FormatUsbCommand() {
  const [device, setDevice] = useState("");
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [fs, setFs] = useState("vfat");
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setDevices(listUsbDevices());
    (async () => {
      const lastDev = await LocalStorage.getItem<string>("lastFormatDevice");
      if (lastDev) setDevice(lastDev);
    })();
  }, []);

  const handleSubmit = async (values: Form.Values) => {
    const dev = (values.device as string) ?? device;
    const fstype = (values.fs as string) ?? fs;
    const lbl = ((values.label as string) ?? label).trim();
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
    await LocalStorage.setItem("lastFormatDevice", dev);
    const devHist = JSON.parse((await LocalStorage.getItem<string>("deviceHistory")) ?? "[]") as any;
    if (!devHist.includes(dev)) devHist.unshift(dev);
    await LocalStorage.setItem("deviceHistory", JSON.stringify(devHist.slice(0, 5)));

    let mkfs = "";
    if (fstype === "vfat") {
      mkfs = lbl ? `sudo mkfs.vfat -F 32 -n "${lbl}" ${dev}` : `sudo mkfs.vfat -F 32 ${dev}`;
    } else if (fstype === "exfat") {
      mkfs = lbl ? `sudo mkfs.exfat -L "${lbl}" ${dev}` : `sudo mkfs.exfat ${dev}`;
    } else if (fstype === "ntfs") {
      mkfs = lbl ? `sudo mkfs.ntfs -f -L "${lbl}" ${dev}` : `sudo mkfs.ntfs -f ${dev}`;
    } else if (fstype === "ext4") {
      mkfs = lbl ? `sudo mkfs.ext4 -L "${lbl}" ${dev}` : `sudo mkfs.ext4 ${dev}`;
    } else {
      await showToast(Toast.Style.Failure, "Unknown filesystem");
      return;
    }

    const script = [
      "set -e",
      `sudo wipefs -a ${dev} || true`,
      mkfs,
      "sync",
      'echo "Format complete."',
    ].join("\n");

    try {
      await runInTerminal(["/bin/bash", "-c", script], { hold: true });
      await showToast(Toast.Style.Success, "Format started", dev);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to start format", String(error));
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Format USB" onSubmit={handleSubmit} />
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
      <Form.Dropdown id="fs" title="Filesystem" value={fs} onChange={setFs}>
        {FILESYSTEMS.map((f) => (
          <Form.Dropdown.Item key={f.value} title={f.label} value={f.value} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="label" title="Label (optional)" value={label} onChange={setLabel} />
      <Form.Checkbox id="confirm" title="I understand this will erase the device" value={confirm} onChange={setConfirm} label="Confirm" />
      <Form.Description text="Destructive: all data on the target device will be erased." />
    </Form>
  );
}
