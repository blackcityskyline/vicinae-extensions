import { List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { LocalStorage } from "@vicinae/api";

export default function RecentCommand() {
  const [isos, setIsos] = useState<string[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const isoHist = JSON.parse((await LocalStorage.getItem<string>("isoHistory")) ?? "[]") as any;
      const devHist = JSON.parse((await LocalStorage.getItem<string>("deviceHistory")) ?? "[]") as any;
      setIsos(isoHist);
      setDevices(devHist);
      setIsLoading(false);
    })();
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search recent">
      <List.Section title="Recent ISOs">
        {isos.map((iso) => (
          <List.Item key={iso} title={iso} />
        ))}
      </List.Section>
      <List.Section title="Recent devices">
        {devices.map((dev) => (
          <List.Item key={dev} title={dev} />
        ))}
      </List.Section>
      <List.EmptyView title="No recent items" />
    </List>
  );
}
