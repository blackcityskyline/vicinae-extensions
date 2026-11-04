import { getPreferenceValues, sendDesktopNotification, updateCommandMetadata } from "@vicinae/api";

import * as mail from "~/api/mail";
import type { MailMessage } from "~/utils/body";
import { isExpired } from "~/utils/mail";
import { newMailTitle, senderLabel, unreported } from "~/utils/seen";
import { formatCountdown } from "~/utils/when";

/**
 * The bar widget of upstream, expressed in Vicinae: a run that happens by itself,
 * every minute, with no window. It is what keeps a disposable address useful while
 * you are doing something else — the mail arrives, the address runs out — and it is
 * the only code here that notifies.
 *
 * With no address it makes no request at all, so installing the extension does not
 * put a periodic call on mail.tm.
 */
export default async function CheckMail() {
  const { notifyNewMail } = getPreferenceValues<Preferences>();

  const current = await mail.state();
  if (!current) return;

  const now = Date.now();

  if (isExpired(current.expiresAt, now)) {
    await mail.unregister();
    await sendDesktopNotification({
      title: "Temp address expired",
      body: `${current.address} was deleted`,
      urgency: "Normal",
    });
    return;
  }

  // Upstream warns once per lifetime, in the last minute, and says what to press.
  // Keyed on the expiry, so extending earns a second warning.
  const msLeft = current.expiresAt - now;
  if (msLeft <= 60_000 && (await mail.warnedExpiry()) !== current.expiresAt) {
    await mail.recordWarnedExpiry(current.expiresAt);
    await sendDesktopNotification({
      title: "Temp address: under a minute left",
      body: "Open TempMail and choose Extend Address",
      urgency: "Normal",
    });
  }

  let list: MailMessage[] = [];
  try {
    list = await mail.messages();
  } catch (failure) {
    // A background run has no panel to put an error in, and a notification every
    // minute from a server that is busy is noise, not information. The inbox shows
    // the same failure the next time it is opened, and stderr keeps the detail.
    console.error(`tempmail: background check failed: ${failure instanceof Error ? failure.message : failure}`);
    return;
  }

  const fresh = unreported(list, await mail.reportedIds());
  await mail.recordReported(list.map((message) => message.id));

  // The countdown and the unread badge, which is what upstream put in the bar: the
  // launcher's own row for this command is the nearest thing to it.
  const unread = list.filter((message) => !message.seen).length;
  await updateCommandMetadata({
    subtitle: `${formatCountdown(Math.max(0, msLeft))} left · ${unread} unread`,
  }).catch((failure: unknown) => {
    console.error(`tempmail: could not set the command subtitle: ${failure instanceof Error ? failure.message : failure}`);
  });

  const newest = fresh[0];
  if (!newest || !notifyNewMail) return;

  // Sender only, never the subject: subjects routinely carry the code the mail was
  // sent to deliver, and a notification sits on screen and in the history.
  await sendDesktopNotification({
    title: newMailTitle(fresh.length),
    body: `from ${senderLabel(newest.from?.name ?? "", newest.from?.address ?? "")}`,
    urgency: "Normal",
  });
}
