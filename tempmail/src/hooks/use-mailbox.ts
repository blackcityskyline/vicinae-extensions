import { useCallback, useEffect, useRef, useState } from "react";

import { showToast, Toast } from "@vicinae/api";

import * as mail from "~/api/mail";
import type { MailMessage } from "~/utils/body";
import { isExpired, MailError } from "~/utils/mail";

export type Mailbox = {
  address: string;
  /** When the address stops existing, or 0 for no address and for the lifetimes this extension did not set. */
  expiresAt: number;
  messages: MailMessage[];
  unread: number;
  /** Why the last load failed, if it did. Shown in place of the inbox. */
  error: string | null;
  isLoading: boolean;
  /** The clock the countdown is measured against; it moves while there is an address. */
  now: number;
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
  const [expiresAt, setExpiresAt] = useState(0);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const busy = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    // A slow poll must not stack up behind itself.
    if (busy.current) return;
    busy.current = true;

    try {
      const current = await mail.state();

      // A lifetime that has run out is over. The address is deleted server-side
      // upstream, and an inbox that can no longer receive anything is not worth
      // showing — but one with no stored lifetime is left alone.
      if (current && isExpired(current.expiresAt, Date.now())) {
        await mail.unregister();
        setAddress("");
        setExpiresAt(0);
        setMessages([]);
        setError(null);
        await showToast({
          style: Toast.Style.Failure,
          title: "TempMail",
          message: `${current.address} has expired.`,
        });
        return;
      }

      const list = current ? await mail.messages() : [];

      setAddress(current?.address ?? "");
      setExpiresAt(current?.expiresAt ?? 0);
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
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    void load();

    if (pollSeconds <= 0) return;

    const timer = setInterval(() => void load(), pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [load, pollSeconds]);

  // The countdown is the reason a lifetime is worth showing, and it has to move
  // while the person is looking at it.
  useEffect(() => {
    if (address === "") return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [address]);

  return {
    address,
    expiresAt,
    messages,
    unread: messages.filter((message) => !message.seen).length,
    error,
    isLoading,
    now,
    reload: load,
  };
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
