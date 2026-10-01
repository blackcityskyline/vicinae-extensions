import { useEffect, useState } from "react";

/**
 * Wait for typing to stop before spending a request on it.
 *
 * Measured: the endpoint takes ten parallel requests without complaint, but one
 * request per keystroke is still ten times the work for the same answer.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

export type Loaded<T> = { value: T | null; error: string | null; isLoading: boolean };

/**
 * Run `load` whenever `deps` change, and report what happened.
 *
 * A `null` load means there is nothing to ask yet. Answers from a load that has
 * been superseded are dropped, so a slow early request cannot overwrite a fast
 * later one.
 */
export function useLoaded<T>(load: (() => Promise<T>) | null, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ value: null, error: null, isLoading: load !== null });

  useEffect(() => {
    if (load === null) {
      setState({ value: null, error: null, isLoading: false });
      return;
    }

    let live = true;
    setState((previous) => ({ ...previous, isLoading: true, error: null }));

    load().then(
      (value) => {
        if (live) setState({ value, error: null, isLoading: false });
      },
      (error: unknown) => {
        if (live) {
          setState({ value: null, error: error instanceof Error ? error.message : String(error), isLoading: false });
        }
      },
    );

    return () => {
      live = false;
    };
    // `deps` is the caller's list of what matters; `load` is rebuilt every render.
  }, deps);

  return state;
}