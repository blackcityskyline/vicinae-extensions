import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const DEST = "org.gnome.NautilusPreviewer";
const OBJECT = "/org/gnome/NautilusPreviewer";
const METHOD = `${DEST}2.ShowFile`;

/**
 * Space-bar preview through GNOME Sushi, the preview Nautilus itself uses.
 *
 * Vicinae has no Quick Look: `Action.ToggleQuickLook` is a no-op. Sushi is a
 * D-Bus activated GJS app that draws the same floating preview window Nautilus
 * gets — images, video, audio, PDFs, text, fonts — and closes on Escape. It is
 * started on demand by the D-Bus call, so nothing runs while it is unused.
 *
 * Returns false when Sushi (or `gdbus`) is missing, so the caller can fall back
 * to opening the file.
 */
export async function previewWithSushi(filePath: string): Promise<boolean> {
  try {
    await execFileAsync(
      "gdbus",
      [
        "call",
        "--session",
        `--dest=${DEST}`,
        `--object-path=${OBJECT}`,
        `--method=${METHOD}`,
        pathToFileURL(filePath).href,
        "", // window handle: none, the compositor places the window
        "false", // closeIfAlreadyShown
        "", // activation token
      ],
      { timeout: 10_000 },
    );
    return true;
  } catch {
    return false;
  }
}
