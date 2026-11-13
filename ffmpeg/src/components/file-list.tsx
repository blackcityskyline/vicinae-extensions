import {
  Action,
  ActionPanel,
  Cache,
  Clipboard,
  Color,
  Icon,
  List,
  showHUD,
  useNavigation,
} from "@vicinae/api";
import { Fragment, useEffect, useState } from "react";
import path from "node:path";

import { previewImage } from "~/api/ffmpeg";
import { probe, ProbeError, type Probe } from "~/api/probe";
import { describe, isImage, size, streamKind, toMarkdown } from "~/utils/media";
import { RunAction } from "~/components/run-action";

const cache = new Cache();
const PREVIEW_KEY = "previewImage";

function previewEnabled(): boolean {
  return cache.get(PREVIEW_KEY) !== "0";
}

/**
 * Every picked file is a row; the pane follows the selection, the way upstream's
 * `RootFileList` follows the Finder selection. There is no indexing and no
 * background work: one ffprobe per selection, one frame for the image.
 */
export function FileList({ files }: { files: string[] }) {
  const { push } = useNavigation();
  const [selected, setSelected] = useState(files[0] ?? "");
  const [probeResult, setProbeResult] = useState<Probe | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(previewEnabled);

  useEffect(() => {
    if (selected === "") return;
    let alive = true;
    setProbeResult(undefined);
    setError(undefined);
    setPreview(undefined);

    probe(selected)
      .then((result) => {
        if (!alive) return;
        setProbeResult(result);
        if (!showPreview || !hasFrame(result)) return;
        previewImage(selected)
          .then((image) => {
            if (alive) setPreview(image);
          })
          .catch(() => {
            // A frame is a nicety: no preview, no error row.
          });
      })
      .catch((failure) => {
        if (alive) setError(failure instanceof ProbeError ? failure.message : String(failure));
      });

    return () => {
      alive = false;
    };
  }, [selected, showPreview]);

  async function copyInfo(): Promise<void> {
    if (probeResult === undefined) return;
    await Clipboard.copy(toMarkdown(describe(probeResult, selected)));
    await showHUD("File info copied");
  }

  function togglePreview(enabled: boolean): void {
    cache.set(PREVIEW_KEY, enabled ? "1" : "0");
    setShowPreview(enabled);
  }

  const sections = probeResult === undefined ? [] : describe(probeResult, selected);

  const actions = (file: string) => (
    <ActionPanel>
      <Action
        title="Run FFmpeg Action"
        icon={Icon.Uppercase}
        onAction={() => push(<RunAction file={file} />)}
      />
      <ActionPanel.Submenu title="Display Setting" icon={Icon.WrenchScrewdriver}>
        <Action title="Show Preview Image" icon={Icon.Image} onAction={() => togglePreview(true)} />
        <Action title="Hide Preview Image" icon={Icon.Minus} onAction={() => togglePreview(false)} />
      </ActionPanel.Submenu>
      <Action
        title="Copy Video Info"
        icon={Icon.CopyClipboard}
        shortcut="copy"
        onAction={copyInfo}
      />
      <Action.CopyToClipboard
        title="Copy File Path"
        icon={Icon.CopyClipboard}
        shortcut="copy-path"
        content={file}
      />
    </ActionPanel>
  );

  const detail = (
    <List.Item.Detail
      isLoading={probeResult === undefined && error === undefined}
      markdown={preview === undefined ? "" : `![](${preview})`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.TagList title="Basic File Info">
            <List.Item.Detail.Metadata.TagList.Item text={kind(probeResult)} color={kindColor(probeResult)} />
            {probeResult?.format.size !== undefined && (
              <List.Item.Detail.Metadata.TagList.Item
                text={size(probeResult.format.size) ?? ""}
                color={Color.Magenta}
              />
            )}
            {probeResult !== undefined && !hasAudio(probeResult) && hasFrame(probeResult) && (
              <List.Item.Detail.Metadata.TagList.Item text="No Audio" color={Color.Red} />
            )}
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Label title="File Name" text={path.basename(selected)} />
          <List.Item.Detail.Metadata.Label title="File Path" text={selected} />
          {error !== undefined && (
            <List.Item.Detail.Metadata.Label title="Error" text={error} icon={Icon.Warning} />
          )}
          {sections
            .filter((section) => section.title !== "File")
            .map((section) => (
              <Fragment key={section.title}>
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.TagList title={section.title}>
                  <List.Item.Detail.Metadata.TagList.Item
                    text={section.title.split(" ")[0]?.toLowerCase() ?? "stream"}
                    color={Color.Blue}
                  />
                </List.Item.Detail.Metadata.TagList>
                {section.rows.map((row) => (
                  <List.Item.Detail.Metadata.Label
                    key={`${section.title}:${row.title}`}
                    title={row.title}
                    text={row.value}
                  />
                ))}
              </Fragment>
            ))}
        </List.Item.Detail.Metadata>
      }
    />
  );

  return (
    <List
      navigationTitle="FFmpeg"
      isShowingDetail
      searchBarPlaceholder="Search files"
      onSelectionChange={setSelected}
    >
      <List.Section title="Files">
        {files.map((file) => (
          <List.Item
            key={file}
            id={file}
            title={path.basename(file)}
            keywords={[file]}
            icon={Icon.FilmStrip}
            detail={detail}
            actions={actions(file)}
          />
        ))}
      </List.Section>
    </List>
  );
}

function hasFrame(result: Probe): boolean {
  return result.streams.some((stream) => stream.codec_type === "video");
}

function hasAudio(result: Probe): boolean {
  return result.streams.some((stream) => stream.codec_type === "audio");
}

function kind(result: Probe | undefined): string {
  if (result === undefined) return "Loading";
  if (isImage(result)) return "Image";
  if (hasAudio(result) && !hasFrame(result)) return "Audio";
  return hasFrame(result) ? "Video" : streamKind(undefined);
}

function kindColor(result: Probe | undefined): Color {
  if (result === undefined || isImage(result)) return Color.Blue;
  if (hasAudio(result) && !hasFrame(result)) return Color.Orange;
  return Color.Green;
}
