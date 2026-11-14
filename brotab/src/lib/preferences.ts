import { getPreferenceValues } from "@vicinae/api";

import { resolveBinary } from "~/lib/cli";

/** The CLI to run: the preference when set, otherwise the usual install spots. */
export function brotabNgBinary(): string {
  return resolveBinary(getPreferenceValues<Preferences>().brotabNgPath);
}
