import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LocalStorage, getPreferenceValues, getSelectedText } from "@vicinae/api";

import { AUTO_DETECT } from "~/api/google";
import type { LanguageCodeSet } from "~/types";
import { parseStored, uniqueTargets } from "~/utils";

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

  // The fallback goes in a ref, not in the dependency list. Three of the four
  // call sites build it inline — `{langFrom, langTo}`, `[lang1, lang2]` — so it is
  // a new object every render, and depending on it makes this effect set state
  // with a new identity, re-render, and do it again. That loop never settles, and
  // every command that reads stored state sits at "Translating..." for ever.
  const fallback = useRef(initial);

  useEffect(() => {
    let live = true;

    void LocalStorage.getItem<string>(key).then((stored) => {
      if (live) setValue(parseStored(stored, fallback.current));
    });

    return () => {
      live = false;
    };
  }, [key]);

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

  // Memoised on what is inside it, not on `stored`. A new object every render
  // would make every `useMemo` that depends on the selected set recompute, and
  // every effect that depends on that memo re-run and set state again — the list
  // sat at "Translating..." for ever. `stored.langTo` keeps its identity because
  // `useStored` hands back the same fallback array it started with.
  const value = useMemo<LanguageCodeSet>(
    () => ({
      langFrom: stored.langFrom,
      langTo: Array.isArray(stored.langTo) ? stored.langTo : [stored.langTo],
    }),
    [stored.langFrom, stored.langTo],
  );

  return [value, setStored];
}

export function useAllLanguageSets(): [LanguageCodeSet[], (next: LanguageCodeSet[]) => void] {
  return useStored<LanguageCodeSet[]>("languages", []);
}

export function useSourceLanguage(): [string, (next: string) => void] {
  return useStored("sourceLanguage", AUTO_DETECT);
}

/**
 * The languages Quick Translate fans out to.
 *
 * Upstream seeds this from the preferences exactly once and then keeps it for
 * ever, so changing `lang2` in the settings left Quick Translate translating into
 * the old language, silently, with nothing in the dropdown to show for it. The
 * preferences are the default here, so a change to them resets the list; edits
 * made inside TargetLanguageList persist until the next change to the settings.
 *
 * Duplicates are dropped: both preferences default to English, and translating
 * into English twice returns the input back twice, which reads as a dead command.
 */
export function useTargetLanguages(): [string[], (next: string[]) => void] {
  const { lang1, lang2 } = usePreferences();
  const [stored, setStored] = useStored("targetLanguages", uniqueTargets([lang1 || "en", lang2 || "en"]));

  const fromPreferences = uniqueTargets([lang1 || "en", lang2 || "en"]).join(",");
  const seed = useRef(fromPreferences);
  useEffect(() => {
    if (seed.current === fromPreferences) return;
    seed.current = fromPreferences;
    setStored(uniqueTargets([lang1 || "en", lang2 || "en"]));
  }, [fromPreferences]);

  // Memoised: a fresh array here is a fresh effect dependency on every render, so
  // every load restarts and throws its own answer away. That is what kept the
  // list at "Translating..." for ever — the fetch resolved, and the answer was
  // dropped as stale.
  const targets = useMemo(() => uniqueTargets(stored), [stored]);

  return [targets, setStored];
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
