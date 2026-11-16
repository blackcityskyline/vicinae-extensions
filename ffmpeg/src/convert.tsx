import { useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, Detail, Icon, LaunchProps, openCommandPreferences } from "@vicinae/api";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { ConverterForm } from "./components/ConverterForm";
import { findFFmpegPath } from "./utils/ffmpegPath";
import { getMediaType } from "./types/media";
import type { AllOutputExtension, QualitySettings, TrimOptions } from "./types/media";

type LaunchContext = {
  prefill?: {
    inputs?: string[];
    outputFormat?: AllOutputExtension;
    quality?: QualitySettings;
    trim?: TrimOptions;
    stripMetadata?: boolean;
    outputDir?: string;
  };
};

function readPrefill(context: Record<string, unknown> | undefined): LaunchContext["prefill"] {
  const raw = context?.prefill;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return JSON.parse(raw) as NonNullable<LaunchContext["prefill"]>;
  } catch {
    return undefined;
  }
}

/** Vicinae has no Finder selection: the clipboard is the only thing that can name a file. */
async function clipboardFile(): Promise<string[]> {
  try {
    const text = (await Clipboard.readText()).trim();
    if (!text || !existsSync(text) || !statSync(text).isFile()) return [];
    return getMediaType(path.extname(text)) === null ? [] : [text];
  } catch {
    return [];
  }
}

export default function Command(props: LaunchProps<{ launchContext?: LaunchContext }>) {
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [initialFiles, setInitialFiles] = useState<string[]>([]);

  // `launchCommand` carries `context` as strings only, so history hands the
  // prefill over JSON-encoded.
  const prefill = readPrefill(props.launchContext);

  useEffect(() => {
    void (async () => {
      const ffmpeg = await findFFmpegPath();
      setMissing(ffmpeg === null);
      setInitialFiles(await clipboardFile());
      setReady(true);
    })();
  }, []);

  if (missing) {
    return (
      <Detail
        markdown={[
          "# FFmpeg not found",
          "",
          "This extension runs the `ffmpeg` on this machine; it does not download one.",
          "",
          "```bash",
          "# Arch",
          "sudo pacman -S ffmpeg",
          "",
          "# Debian / Ubuntu",
          "sudo apt install ffmpeg",
          "```",
          "",
          "FFmpeg 6.0 or newer is required. A binary elsewhere can be named in the extension preferences.",
        ].join("\n")}
        actions={
          <ActionPanel>
            <Action title="Open Extension Preferences" icon={Icon.Cog} shortcut="open" onAction={openCommandPreferences} />
            <Action
              title="Check Again"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["ctrl"], key: "r" }}
              onAction={() => {
                void (async () => {
                  const ffmpeg = await findFFmpegPath();
                  setMissing(ffmpeg === null);
                })();
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  // Nothing renders until the first probe finishes: flashing the form and then
  // replacing it with the missing-FFmpeg page is worse than a beat of blank.
  if (!ready) return null;

  return <ConverterForm initialFiles={initialFiles} launchContext={{ prefill }} />;
}
