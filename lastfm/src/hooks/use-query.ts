import { useEffect, useState } from "react";

export type Query<T> = {
  items: T[];
  error: string | null;
  isLoading: boolean;
};

/**
 * One request per change of method or period, and a `Cmd+R` reload when nothing
 * else changed. No cache: Last.fm has no cache headers worth trusting here and
 * a stale chart is worse than a request.
 */
export function useQuery<T>(run: () => Promise<T[]>, deps: readonly unknown[]): Query<T> & { reload: () => void } {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void run()
      .then((found) => {
        if (cancelled) return;
        setItems(found);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(failure instanceof Error ? failure.message : "Something went wrong.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { items, error, isLoading, reload: () => setNonce((value) => value + 1) };
}
