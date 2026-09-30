import { applyProfile } from "~/api/vectis";
import { reportResult } from "~/components/feedback";
import type { PowerProfileValue } from "~/utils/vectis";

/**
 * The body shared by the three standalone Set <profile> commands.
 *
 * They are `no-view` commands, so they run on the keystroke that launched them
 * and the toast is the only feedback there is. Keeping one implementation means
 * the three cannot drift apart in how they report a failure.
 */
export default async function setProfileCommand(profile: PowerProfileValue): Promise<void> {
  const result = await applyProfile(profile);
  await reportResult(result, `Profile set to ${profile}`);
}