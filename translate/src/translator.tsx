import { useEffect, useState } from "react";

import { Icon, List, getPreferenceValues } from "@vicinae/api";

import { translate } from "~/api/google";
import { TranslationRow } from "~/components/translation";
import { useDebounced, useLoaded } from "~/hooks";
import { AUTO } from "~/utils/languages";

/** Long enough that a word is not spent on a request, short enough to feel live. */
const TYPING_MS = 400;

/**
 * The view both commands share.
 *
 * One translation, one row. The source language is never chosen: Google works it
 * out per request and the row says what it decided, which is right almost every
 * time and one less thing to configure.
 *
 * `Translate Selection` hands over a promise, because reading the selection of the
 * app you came from cannot be done synchronously.
 */
export function Translator({ selection }: { selection?: Promise<string> } = {}) {
  const { targetLanguage, defaultAction } = getPreferenceValues<Preferences>();

  // Both preferences are optional, and an optional preference that is unset comes
  // back undefined — never `required: true`, because that makes Vicinae refuse to
  // start the command and say nothing about why. See docs/api-porting.md.
  const target = targetLanguage || "ru";
  const pasteFirst = defaultAction === "paste";

  const [text, setText] = useState("");
  const asked = useDebounced(text.trim(), TYPING_MS);

  useEffect(() => {
    void selection?.then(setText);
  }, [selection]);

  const loaded = useLoaded(
    asked === "" ? null : () => translate(asked, AUTO, target),
    [asked, target],
  );

  return (
    <List
      searchBarPlaceholder="Text to translate"
      searchText={text}
      onSearchTextChange={setText}
      isLoading={loaded.isLoading}
    >
      {asked === "" ? (
        <List.EmptyView
          title="Nothing to translate"
          description="Type something, or use Translate Selection."
          icon={Icon.Text}
        />
      ) : loaded.error ? (
        <List.EmptyView title="Google did not answer" description={loaded.error} icon={Icon.XMarkCircle} />
      ) : loaded.value ? (
        <TranslationRow source={asked} translation={loaded.value} pasteFirst={pasteFirst} />
      ) : null}
    </List>
  );
}
