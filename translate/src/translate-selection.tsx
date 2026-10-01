import { getSelectedText } from "@vicinae/api";

import { Translator } from "~/translator";

/**
 * Translate what was selected in whatever was focused when the command ran.
 *
 * Having nothing selected is not an error: the view opens with an empty search
 * bar, which is what an empty selection should do.
 */
export default function TranslateSelection() {
  return <Translator selection={getSelectedText().catch(() => "")} />;
}
