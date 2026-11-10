import { Action, ActionPanel, Form, Icon, Toast, closeMainWindow, getPreferenceValues, showToast } from "@vicinae/api";
import { useState } from "react";

import { hasMutagen, startJob } from "~/api/jobs";
import { FORMATS, defaultFolder, expandHome, formatLabel, qualityOptions, type Format } from "~/utils/formats";
import { splitLinks } from "~/utils/job";

type Props = {
  /** Set when the form was pushed from the queue: return there after starting. */
  onStarted?: () => void;
};

type Failure = { field: "links" | "folder"; message: string };

/**
 * One form per download. Anything typed in the link box is split into links and
 * each one becomes its own detached job, so the window may close immediately.
 */
export default function DownloadForm({ onStarted }: Props) {
  const prefs = getPreferenceValues<Preferences>();
  const audioFolder = prefs.audioFolder || "~/Music";
  const videoFolder = prefs.videoFolder || "~/Videos";
  const [links, setLinks] = useState("");
  const [format, setFormat] = useState<Format>((prefs.defaultFormat as Format) ?? "opus");
  const [quality, setQuality] = useState("best");
  const [folder, setFolder] = useState(defaultFolder(format, audioFolder, videoFolder));
  const [playlists, setPlaylists] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  function changeFormat(next: Format): void {
    // The folder follows the format only while it is still the old default;
    // a folder the user typed stays as typed.
    if (folder.trim() === defaultFolder(format, audioFolder, videoFolder)) {
      setFolder(defaultFolder(next, audioFolder, videoFolder));
    }
    setFormat(next);
    setQuality("best");
    setFailure(null);
  }

  async function submit(): Promise<void> {
    const urls = splitLinks(links);
    if (urls.length === 0) {
      setFailure({ field: "links", message: "Paste a link first." });
      return;
    }
    const unsupported = urls.find((url) => !/^https?:\/\//i.test(url));
    if (unsupported) {
      setFailure({ field: "links", message: `Only http and https links: ${unsupported}` });
      return;
    }
    if (!folder.trim()) {
      setFailure({ field: "folder", message: "Say where the file should go." });
      return;
    }

    const dir = expandHome(folder, process.env.HOME ?? "");
    const mutagen = hasMutagen();
    for (const url of urls) {
      startJob({
        url,
        format,
        quality,
        dir,
        playlists,
        cookies: prefs.cookiesBrowser ?? "none",
        metadata: prefs.embedMetadata !== false,
        mutagen,
      });
    }

    await showToast({
      style: Toast.Style.Success,
      title: urls.length === 1 ? "Download started" : `${urls.length} downloads started`,
      message: `${formatLabel(format)} · ${dir}`,
    });
    setLinks("");
    if (onStarted) onStarted();
    else await closeMainWindow();
  }

  return (
    <Form
      navigationTitle="Download"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Download" icon={Icon.Download} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="links"
        title="Links"
        placeholder={"One per line, or separated by commas:\nhttps://…"}
        value={links}
        error={failure?.field === "links" ? failure.message : undefined}
        onChange={(next) => {
          setLinks(next);
          setFailure(null);
        }}
      />
      <Form.Dropdown id="format" title="Format" value={format} onChange={(next) => changeFormat(next as Format)}>
        {FORMATS.map((entry) => (
          <Form.Dropdown.Item key={entry.value} title={entry.label} value={entry.value} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="quality" title="Quality" value={quality} onChange={setQuality}>
        {qualityOptions(format).map((option) => (
          <Form.Dropdown.Item key={option.value} title={option.label} value={option.value} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="folder"
        title="Folder"
        placeholder="~/Music"
        value={folder}
        error={failure?.field === "folder" ? failure.message : undefined}
        onChange={(next) => {
          setFolder(next);
          setFailure(null);
        }}
      />
      <Form.Checkbox
        id="playlists"
        title="Playlist"
        label="Download the whole playlist"
        value={playlists}
        onChange={setPlaylists}
      />
    </Form>
  );
}
