import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useMemo, useState } from "react";

import { configure, makeClient, type Torrent } from "~/api/rpc";
import { connection } from "~/preferences";

const PRIORITIES = [
  { value: "1", title: "High" },
  { value: "0", title: "Normal" },
  { value: "-1", title: "Low" },
];

/** The four `torrent-set` fields upstream exposes, in one form and one call. */
export function TorrentConfiguration({ torrent, onSaved }: { torrent: Torrent; onSaved: () => void }) {
  const { pop } = useNavigation();
  const client = useMemo(() => makeClient(connection()), []);
  const [priority, setPriority] = useState(String(torrent.bandwidthPriority));
  const [downloadLimited, setDownloadLimited] = useState(torrent.downloadLimited);
  const [downloadLimit, setDownloadLimit] = useState(String(torrent.downloadLimit));
  const [uploadLimited, setUploadLimited] = useState(torrent.uploadLimited);
  const [uploadLimit, setUploadLimit] = useState(String(torrent.uploadLimit));
  const [error, setError] = useState("");

  function rate(value: string): number | undefined {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
  }

  async function submit(): Promise<boolean> {
    const down = rate(downloadLimit);
    const up = rate(uploadLimit);
    if (down === undefined || up === undefined) {
      setError("A limit is a non-negative number of kB/s.");
      return false;
    }

    try {
      await configure(client, torrent.id, {
        bandwidthPriority: Number(priority),
        downloadLimited,
        downloadLimit: down,
        uploadLimited,
        uploadLimit: up,
      });
      onSaved();
      await showToast({ style: Toast.Style.Success, title: "Torrent settings saved" });
      pop();
      return true;
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not save the torrent settings",
        message: failure instanceof Error ? failure.message : String(failure),
      });
      return false;
    }
  }

  return (
    <Form
      navigationTitle="Torrent Configuration"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" icon={Icon.Checkmark} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="priority" title="Transfer Priority" value={priority} onChange={setPriority}>
        {PRIORITIES.map((entry) => (
          <Form.Dropdown.Item key={entry.value} title={entry.title} value={entry.value} />
        ))}
      </Form.Dropdown>
      <Form.Separator />
      <Form.Checkbox
        id="downloadLimited"
        title="Limit Download"
        label="Enabled"
        value={downloadLimited}
        onChange={setDownloadLimited}
      />
      <Form.TextField
        id="downloadLimit"
        title="Download Limit"
        placeholder="kB/s"
        value={downloadLimit}
        error={error === "" ? undefined : error}
        onChange={(value) => {
          setDownloadLimit(value);
          setError("");
        }}
      />
      <Form.Checkbox
        id="uploadLimited"
        title="Limit Upload"
        label="Enabled"
        value={uploadLimited}
        onChange={setUploadLimited}
      />
      <Form.TextField
        id="uploadLimit"
        title="Upload Limit"
        placeholder="kB/s"
        value={uploadLimit}
        onChange={(value) => {
          setUploadLimit(value);
          setError("");
        }}
      />
    </Form>
  );
}
