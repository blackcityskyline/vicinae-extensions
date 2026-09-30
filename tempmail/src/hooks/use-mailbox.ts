import { useCallback, useEffect, useRef, useState } from "react";

import { showToast, Toast } from "@vicinae/api";

import * as mail from "~/api/mail";
import type { MailMessage } from "~/utils/body";
import { MailError } from "~/utils/mail";

export type Mailbox = {
  address: string;
  messages: MailMessage[];
  /** Why the last load failed, if it did. Shown in place of the inbox. */
  error: string | null;
  isLoading: boolean;
};

export type UseMailbox = Mailbox & {
  reload: () => Promise<void>;
};

/**
 * `pollSeconds` of 0 turns polling off. The API allows 30 requests a minute
 * (measured from its `ratelimit-policy: 30; w=60` header), so a short interval
 * leaves nothing for opening or deleting a message.
 */
export function useMailbox(pollSeconds: number): UseMailbox {
  const [address, setAddress] = useState("");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The interval must not be torn down and rebuilt on every poll, which would
  // turn a 10-second poll into a request per render.
  const busy = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    // A slow poll must not stack up behind itself.
    if (busy.current) return;
    busy.current = true;

    try {
      if (await mail.hasExpired()) {
        await mail.unregister();
        const domain = (await mail.domains())[0];
        if (domain) await mail.registerRandom(domain);
        setMessages([]);
      }

      const current = (await mail.address()) ?? "";
      const list = current ? await mail.messages() : [];

      setAddress(current);
      setMessages(list);
      setError(null);
    } catch (failure) {
      const message = failure instanceof MailError ? failure.message : "Something went wrong.";
      setError(message);

      // A rate-limited or lost inbox is worth saying once; repeating it on every
      // poll would bury the list.
      if (failure instanceof MailError && failure.kind !== "rate") {
        await showToast({ style: Toast.Style.Failure, title: "TempMail", message });
      }
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    if (pollSeconds <= 0) return;

    const timer = setInterval(() => void load(), pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [load, pollSeconds]);

  return { address, messages, error, isLoading, reload: load };
}

/** Wraps an action so its failure reaches a toast instead of vanishing. */
export async function attempt(work: () => Promise<void>, title = "TempMail"): Promise<void> {
  try {
    await work();
  } catch (failure) {
    await showToast({
      style: Toast.Style.Failure,
      title,
      message: failure instanceof Error ? failure.message : "Something went wrong.",
    });
  }
}
