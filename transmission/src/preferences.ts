import { getPreferenceValues } from "@vicinae/api";

import type { Connection } from "~/api/rpc";

type Stored = {
  host?: string;
  port?: string;
  ssl?: boolean;
  username?: string;
  password?: string;
};

/** One place to turn the stored preferences into a connection, for all three commands. */
export function connection(): Connection {
  const values = getPreferenceValues<Stored>();
  return {
    host: values.host ?? "localhost",
    port: values.port ?? "9091",
    ssl: values.ssl ?? false,
    username: values.username ?? "",
    password: values.password ?? "",
  };
}
