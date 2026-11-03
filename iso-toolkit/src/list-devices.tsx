import { List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listAllBlockDevices, type BlockDevice } from "~/lib/usb";

export default function ListDevicesCommand() {
  const [devices, setDevices] = useState<BlockDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setDevices(listAllBlockDevices());
    setIsLoading(false);
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search devices">
      {devices.map((d) => (
        <List.Item
          key={d.path}
          title={d.path}
          subtitle={`${d.size} ${d.model}`.trim()}
          accessories={[
            { text: d.type },
            { text: d.mountpoints.join(", ") || "not mounted" },
          ]}
        />
      ))}
      <List.EmptyView title="No block devices found" />
    </List>
  );
}
