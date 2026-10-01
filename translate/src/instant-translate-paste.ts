import { Clipboard, showHUD } from "@vicinae/api";

import { baseInstantTranslate } from "~/instant-translate";

export default async function InstantTranslatePaste() {
  await baseInstantTranslate(async (translatedText) => {
    await Clipboard.paste(translatedText);
    await showHUD("✓ Pasted");
  });
}
