import { useCallback, useEffect, useRef, useState } from "react";

import { describeError } from "~/lib/cli";

export type Page<T> = { items: T[]; hasMore: boolean };

/** One screenful plus a little: enough to fill the list, small enough to be quick. */
export const PAGE_SIZE = 100;

/**
 * One page at a time. The browser has 12 457 visits, so nothing here loads the
 * whole store: the first page arrives on mount, the next when Vicinae reaches the
 * end of the list, and `key` — the search text — starts over.
 *
 * `fetchPage` takes the offset, so the caller owns which CLI command and which
 * response key it uses.
 */
export function usePaged<T>(fetchPage: (offset: number) => Promise<Page<T>>, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sequence = useRef(0);
  const busy = useRef(false);
  const latest = useRef(fetchPage);
  latest.current = fetchPage;

  const reload = useCallback(() => {
    const current = ++sequence.current;
    setLoading(true);
    latest
      .current(0)
      .then((page) => {
        if (current !== sequence.current) return;
        setItems(page.items);
        setHasMore(page.hasMore);
        setError(null);
      })
      .catch((failure: Error) => {
        if (current !== sequence.current) return;
        setItems([]);
        setHasMore(false);
        setError(describeError(failure));
      })
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, []);

  useEffect(reload, [key, reload]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    const current = sequence.current;
    busy.current = true;
    try {
      const page = await latest.current(items.length);
      if (current !== sequence.current) return;
      // ponytail: offset paging, so a row inserted above between two pages can
      // repeat once. Switch to a keyset cursor if the lists get edited while open.
      setItems((previous) => [...previous, ...page.items]);
      setHasMore(page.hasMore);
    } catch (failure) {
      if (current === sequence.current) setError(describeError(failure));
    } finally {
      busy.current = false;
    }
  }, [hasMore, items.length]);

  /** Drops a row without refetching the pages already shown. */
  const forget = useCallback((match: (item: T) => boolean) => {
    setItems((previous) => previous.filter((item) => !match(item)));
  }, []);

  return { items, hasMore, isLoading, error, loadMore, reload, forget };
}
