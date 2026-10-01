import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LocalStorage, getPreferenceValues, getSelectedText } from "@vicinae/api";

import { AUTO_DETECT } from "~/api/google";
import type { LanguageCodeSet } from "~/types";
import { parseStored } from "~/utils";

/**
 * The hooks the reference builds its state out of.
 *
 * Raycast's `useCachedState` is per-extension persistent state that reads
 * synchronously; `LocalStorage` is asynchronous. `useStored` is the shim, and it
 * paints the default first and replaces it a tick later, which is the one
 * behaviour difference worth knowing about.
 */

export type Preferences = {
  langFrom: string;
  lang1: string;
  lang2: string;
  autoInput?: boolean;
  defaultAction?: string;
  prioritizeCrossLanguage?: boolean;
};

export function usePreferences(): Preferences {
  return useMemo(() => getPreferenceValues<Preferences>(), []);
}

/**
 * The dropdown preferences of the reference, with the defaults filled in.
 *
 * They are `required: false` here rather than `required: true` as upstream,
 * because a required preference left unset makes Vicinae refuse to start the
 * command and log nothing at all. See `docs/api-porting.md`.
 */
export function usePreferencesLanguageSet(): LanguageCodeSet {
  const { langFrom, lang1, lang2 } = usePreferences();
  return { langFrom: langFrom || AUTO_DETECT, langTo: [lang1 || "en", lang2 || "en"] };
}

export function useStored<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let live = true;

    void LocalStorage.getItem<string>(key).then((stored) => {
      if (live) setValue(parseStored(stored, initial));
    });

    return () => {
      live = false;
    };
  }, [key, initial]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      void LocalStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  return [value, update];
}

export function useSelectedLanguagesSet(): [LanguageCodeSet, (next: LanguageCodeSet) => void] {
  const preferencesSet = usePreferencesLanguageSet();
  // Upstream stored `{langFrom, langTo: "en"}` before the target list existed, so
  // what is on disk may still be the old shape.
  const [stored, setStored] = useStored<{ langFrom: string; langTo: string[] | string }>(
    "selectedLanguageSet",
    preferencesSet,
  );

  const value: LanguageCodeSet = {
    langFrom: stored.langFrom,
    langTo: Array.isArray(stored.langTo) ? stored.langTo : [stored.langTo],
  };

  return [value, setStored];
}

export function useAllLanguageSets(): [LanguageCodeSet[], (next: LanguageCodeSet[]) => void] {
  return useStored<LanguageCodeSet[]>("languages", []);
}

export function useSourceLanguage(): [string, (next: string) => void] {
  return useStored("sourceLanguage", AUTO_DETECT);
}

export function useTargetLanguages(): [string[], (next: string[]) => void] {
  const { lang1, lang2 } = usePreferences();
  return useStored("targetLanguages", [lang1 || "en", lang2 || "en"].filter((lang) => lang !== AUTO_DETECT));
}

/**
 * The text field, filled from the selection when the preference says so.
 *
 * Upstream only ever asks for the selection once, on mount, and only if the field
 * is still empty.
 */
export function useTextState(): [string, (value: string) => void] {
  const { autoInput } = usePreferences();
  const [text, setText] = useState("");
  const current = useRef(text);
  current.current = text;

  useEffect(() => {
    if (!autoInput) return;

    void getSelectedText()
      .then((selected) => {
        if (!current.current) setText(selected ?? "");
      })
      .catch(() => {
        // Nothing selected, or the app in front will not say. An empty field.
      });
  }, [autoInput]);

  return [text, setText];
}

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

export type PromiseState<T> = { data: T | undefined; isLoading: boolean; error?: Error };

/**
 * The reference's `usePromise`, which is `useEffect` plus three fields.
 *
 * Raycast compares the argument list itself; here it is the dependency list, so
 * an options object built inline at the call site would re-run on every render.
 * Every call site below therefore passes a memoised object.
 */
export function usePromise<TArgs extends unknown[], T>(
  run: (...args: TArgs) => Promise<T>,
  args: TArgs,
): PromiseState<T> {
  const [state, setState] = useState<PromiseState<T>>({ data: undefined, isLoading: true });

  useEffect(() => {
    let live = true;
    setState((previous) => ({ ...previous, isLoading: true }));

    run(...args).then(
      (data) => {
        if (live) setState({ data, isLoading: false });
      },
      (error: unknown) => {
        if (!live) return;
        setState({
          data: undefined,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );

    return () => {
      live = false;
    };
  }, args);

  return state;
}
