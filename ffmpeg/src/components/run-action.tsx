import { Action, ActionPanel, Clipboard, Icon, List, showHUD, showToast, Toast, useNavigation } from "@vicinae/api";
import { existsSync } from "node:fs";
import path from "node:path";
import { useState } from "react";

import { runFFmpeg } from "~/api/ffmpeg";
import { probe } from "~/api/probe";
import {
  outputPath,
  rotateArgs,
  rotationSuffix,
  videoLoopArgs,
  type Rotation,
} from "~/utils/ffmpeg";
import { describe, toMarkdown } from "~/utils/media";

type Kind = "videoloop" | "copy-info" | "copy-path" | "rotate-180" | "rotate-right" | "rotate-left";

type Option = {
  kind: Kind;
  title: string;
  icon: Icon;
};

const SECTIONS: { title: string; options: Option[] }[] = [
  {
    title: "Convert to VideoLoop",
    options: [{ kind: "videoloop", title: "Convert VideoLoop", icon: Icon.FilmStrip }],
  },
  {
    title: "Copy Info",
    options: [
      { kind: "copy-info", title: "Copy Video Info", icon: Icon.CopyClipboard },
      { kind: "copy-path", title: "Copy File Path", icon: Icon.CopyClipboard },
    ],
  },
  {
    title: "Rotate",
    options: [
      { kind: "rotate-180", title: "Rotate 180°", icon: Icon.Circle },
      { kind: "rotate-right", title: "Rotate Right (90°)", icon: Icon.RotateClockwise },
      { kind: "rotate-left", title: "Rotate Left (-90°)", icon: Icon.RotateAntiClockwise },
    ],
  },
];

const INSTRUCTIONS: Record<string, string> = {
  videoloop: `## Convert file to VideoLoop

Press enter to start conversion.

This creates a silent \`.mp4\` next to the original, with \`_videoloop\` as a suffix.
It is encoded with x264 at about 4000 kbit/s, the short side scaled to 1080, the
veryslow preset and \`+faststart\`.`,
  "rotate-180": "Press enter to rotate the video by 180°.",
  "rotate-right": "Press enter to rotate the video 90° clockwise.",
  "rotate-left": "Press enter to rotate the video 90° counter-clockwise.",
};

export function RunAction({ file }: { file: string }) {
  const { pop } = useNavigation();
  const [percent, setPercent] = useState<number | undefined>(undefined);
  const [running, setRunning] = useState<Kind | undefined>(undefined);

  async function copyInfo(): Promise<void> {
    const result = await probe(file);
    await Clipboard.copy(toMarkdown(describe(result, file)));
    await showHUD("File info copied");
    pop();
  }

  async function transform(kind: Kind): Promise<void> {
    const options =
      kind === "videoloop"
        ? { args: videoLoopArgs, suffix: "_videoloop", extension: ".mp4" }
        : {
            args: (input: string, output: string) =>
              rotateArgs(input, output, rotation(kind)),
            suffix: rotationSuffix(rotation(kind)),
            extension: path.extname(file),
          };

    const output = outputPath(file, options.suffix, options.extension, existsSync);
    setPercent(0);
    setRunning(kind);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: kind === "videoloop" ? "Converting" : "Rotating",
      message: path.basename(output),
    });

    try {
      await runFFmpeg(options.args(file, output), (value) => {
        setPercent(value);
        toast.message = `${value} %`;
      });
      toast.style = Toast.Style.Success;
      toast.title = `Saved ${path.basename(output)}`;
      toast.message = undefined;
    } catch (failure) {
      toast.style = Toast.Style.Failure;
      toast.title = "ffmpeg failed";
      toast.message = String(failure);
    } finally {
      setRunning(undefined);
    }
  }

  function run(kind: Kind): void {
    if (kind === "copy-info") {
      void copyInfo();
      return;
    }
    if (kind === "copy-path") {
      void Clipboard.copy(file).then(() => showHUD("File path copied"));
      pop();
      return;
    }
    void transform(kind);
  }

  function detail(kind: Kind): string {
    if (running !== undefined) {
      return running === kind ? `## Processing: ${percent ?? 0} %` : "Another action is running.";
    }

    return INSTRUCTIONS[kind] ?? "";
  }

  return (
    <List navigationTitle="FFmpeg Action" isShowingDetail>
      {SECTIONS.map((section) => (
        <List.Section key={section.title} title={section.title}>
          {section.options.map((option) => (
            <List.Item
              key={option.kind}
              title={option.title}
              icon={option.icon}
              detail={<List.Item.Detail markdown={detail(option.kind)} />}
              actions={
                <ActionPanel title="FFmpeg Action">
                  <Action title="Run" onAction={() => run(option.kind)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function rotation(kind: Kind): Rotation {
  if (kind === "rotate-180") return "180";
  if (kind === "rotate-left") return "left";
  return "right";
}
