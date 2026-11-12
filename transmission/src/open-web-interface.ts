import { open } from "@vicinae/api";

import { webUrl } from "~/api/rpc";
import { connection } from "~/preferences";

/** A `no-view` command has no clipboard here, and this needs none: it opens a URL. */
export default async function OpenWebInterface(): Promise<void> {
  await open(webUrl(connection()));
}
