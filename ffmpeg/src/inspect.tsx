import { useEffect, useState } from "react";
import { Action, ActionPanel, Form, Icon, List, showInFileBrowser } from "@vicinae/api";
import path from "node:path";
import { formatBytes } from "./utils/format";
import { formatTimeString } from "./utils/time";
import { inspectMedia, type MediaInspection, type MediaStream } from "./utils/mediaProbe";

export default function Command() {
  const [files, setFiles] = useState<string[]>([]);

  if (files.length === 0) return <InspectorPicker onSelect={setFiles} />;
  return <InspectionList files={files} onChooseFiles={() => setFiles([])} />;
}

function InspectorPicker({ onSelect }: { onSelect: (files: string[]) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Inspect Media" icon={Icon.MagnifyingGlass} onSubmit={() => onSelect(files)} />
        </ActionPanel>
      }
    >
      <Form.FilePicker id="files" title="Media Files" allowMultipleSelection value={files} onChange={setFiles} />
    </Form>
  );
}

type InspectionResult = { inspection?: MediaInspection; error?: string };

function InspectionList({ files, onChooseFiles }: { files: string[]; onChooseFiles: () => void }) {
  const [results, setResults] = useState<Map<string, InspectionResult>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      files.map(async (file): Promise<[string, InspectionResult]> => {
        try {
          return [file, { inspection: await inspectMedia(file) }];
        } catch (error) {
          return [file, { error: error instanceof Error ? error.message : String(error) }];
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResults(new Map(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [files.join("\0")]);

  return (
    <List isLoading={loading} isShowingDetail searchBarPlaceholder="Search inspected media">
      {files.map((file) => {
        const result = results.get(file);
        const inspection = result?.inspection;
        return (
          <List.Item
            key={file}
            icon={result?.error ? Icon.Warning : Icon.FilmStrip}
            title={path.basename(file)}
            subtitle={inspection?.container ?? path.extname(file)}
            accessories={inspection ? [{ text: formatBytes(inspection.sizeBytes) }] : []}
            detail={
              result?.error ? (
                <List.Item.Detail markdown={`# Could not inspect this file\n\n\`\`\`\n${result.error}\n\`\`\``} />
              ) : inspection ? (
                <InspectionDetail inspection={inspection} />
              ) : undefined
            }
            actions={
              <ActionPanel>
                <Action.Open title="Open File" target={file} shortcut="open" />
                <Action
                  title="Show in File Browser"
                  icon={Icon.Finder}
                  shortcut={{ modifiers: ["shift"], key: "enter" }}
                  onAction={() => showInFileBrowser(file, { select: true })}
                />
                <Action
                  title="Choose Other Files"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ["ctrl"], key: "n" }}
                  onAction={onChooseFiles}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function InspectionDetail({ inspection }: { inspection: MediaInspection }) {
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="File" text={inspection.fileName} />
          <List.Item.Detail.Metadata.Label title="Size" text={formatBytes(inspection.sizeBytes)} />
          <List.Item.Detail.Metadata.Label title="Container" text={inspection.container ?? "Unknown"} />
          <List.Item.Detail.Metadata.Label
            title="Duration"
            text={inspection.durationSec === undefined ? "Unknown" : formatTimeString(inspection.durationSec)}
          />
          <List.Item.Detail.Metadata.Label
            title="Bitrate"
            text={inspection.bitrateKbps === undefined ? "Unknown" : `${inspection.bitrateKbps} kbps`}
          />
          {inspection.streams.map((stream) => (
            <List.Item.Detail.Metadata.Label
              key={stream.index}
              title={`${stream.type.charAt(0).toUpperCase()}${stream.type.slice(1)} ${stream.index}`}
              text={describeStream(stream)}
            />
          ))}
          {Object.entries(inspection.metadata).map(([key, value]) => (
            <List.Item.Detail.Metadata.Label key={key} title={key} text={value} />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function describeStream(stream: MediaStream): string {
  const details = [stream.codec];
  if (stream.width && stream.height) details.push(`${stream.width}×${stream.height}`);
  if (stream.frameRate) details.push(`${stream.frameRate} fps`);
  if (stream.pixelFormat) details.push(stream.pixelFormat);
  if (stream.sampleRate) details.push(`${stream.sampleRate} Hz`);
  if (stream.channels) details.push(stream.channels);
  if (stream.bitrateKbps) details.push(`${stream.bitrateKbps} kbps`);
  if (stream.language) details.push(stream.language);
  return details.filter(Boolean).join(" · ");
}
