import { useCallback, useEffect, useState } from "react";

import { listPairedBluetoothDevices } from "../bluetooth";
import type { BluetoothDevice } from "../utils/audioServer";

export function useBluetoothDevices(): {
  devices: BluetoothDevice[];
  refresh: () => Promise<void>;
} {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);

  const refresh = useCallback(async () => {
    try {
      setDevices(await listPairedBluetoothDevices());
    } catch {
      // BlueZ is optional: without it the section is empty and a sink's
      // reconnect action reports the concrete error instead.
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { devices, refresh };
}
