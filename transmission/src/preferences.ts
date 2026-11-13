import { getPreferenceValues } from "@vicinae/api";

import type { Connection } from "~/api/rpc";
import { maxFilesShown, parseDirection, parseSortBy, quickPaths } from "~/utils/list";

type Stored = {
  host?: string;
  port?: string;
  ssl?: boolean;
  username?: string;
  password?: string;
  sortBy?: string;
  sortDirection?: string;
  maxFilesShown?: string;
  quickPaths?: string;
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

/** The list's ordering and the file cap, each validated where the tests can see it. */
export function listSettings(): { by: ReturnType<typeof parseSortBy>; direction: ReturnType<typeof parseDirection>; maxFiles: number } {
  const values = getPreferenceValues<Stored>();
  return {
    by: parseSortBy(values.sortBy),
    direction: parseDirection(values.sortDirection),
    maxFiles: maxFilesShown(values.maxFilesShown),
  };
}

export function addSettings(): { quickPaths: string[] } {
  return { quickPaths: quickPaths(getPreferenceValues<Stored>().quickPaths) };
}
