import { Clipboard, getPreferenceValues, getSelectedText, showHUD } from "@vicinae/api";

import { simpleTranslate } from "~/api/google";
import type { LanguageCode } from "~/types";
import type { Preferences } from "~/hooks";

/** Reading time per character, from an average of ~200 words per minute. */
const READING_TIME_PER_CHAR_MS = 150;

const MIN_HUD_MS = 2000;
const MAX_HUD_MS = 15000;
const HUD_REFRESH_MS = 1000;

/**
 * Keep a HUD up long enough to read.
 *
 * `showHUD` disappears on its own timer, and the reference re-shows it every
 * second until the estimated reading time is up. Kept as it was.
 */
export async function showExtendedHUD(message: string, minDurationMs = MIN_HUD_MS): Promise<void> {
  await showHUD(message);

  const wanted = Math.max(minDurationMs, message.length * READING_TIME_PER_CHAR_MS);
  const total = Math.min(wanted, MAX_HUD_MS);

  for (let shown = 0; shown < Math.floor(total / HUD_REFRESH_MS); shown++) {
    await new Promise((resolve) => setTimeout(resolve, HUD_REFRESH_MS));
    await showHUD(message);
  }
}

/**
 * Translate whatever is selected, without opening a window.
 *
 * The reference's `baseInstantTranslate`, including the two HUD messages for the
 * two ways this can fail.
 */
export async function baseInstantTranslate(
  onTranslated: (translatedText: string) => Promise<void>,
): Promise<void> {
  try {
    // Straight from the preferences: this runs outside any component, so no hooks.
    const { langFrom, lang1, lang2 } = getPreferenceValues<Preferences>();

    // Measured: on Wayland `getSelectedText` reads the *primary* selection, which
    // only exists after a middle-click copy. Copying with ctrl+C puts the text in
    // the ordinary clipboard, where this sees nothing — so the command used to
    // exit in 2 ms with "No text selected" and look broken. The clipboard is the
    // fallback, which is what a copy is on this desktop.
    const selection = await getSelectedText().catch(() => "");
    const clipboard = selection ? "" : await Clipboard.readText().catch(() => "");
    const selectedText = selection || clipboard;

    if (!selectedText || selectedText.trim().length === 0) {
      await showHUD("Nothing selected and nothing in the clipboard.");
      return;
    }

    await showHUD("Translating...");

    const result = await simpleTranslate(selectedText, {
      langFrom: langFrom as LanguageCode,
      langTo: [lang1 as LanguageCode, lang2 as LanguageCode],
    });

    if (result.text) {
      await onTranslated(result.text);
    } else {
      throw new Error("Translation not found in response");
    }
  } catch {
    await showHUD("Translation failed. Please try again.");
  }
}
