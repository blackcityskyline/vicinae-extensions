import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Keyboard,
  popToRoot,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { add, makeClient, session, setStopped, type Torrent } from "~/api/rpc";
import { addSettings, connection } from "~/preferences";
import { expandHome, looksLikeTorrent } from "~/utils/torrent";

type Props = {
  /** Set when the form is pushed from the list, which must stay underneath. */
  onAdded?: (torrent: Torrent) => void;
};

export function AddTorrentForm({ onAdded }: Props) {
  const client = useMemo(() => makeClient(connection()), []);
  const navigation = useNavigation();
  const { quickPaths } = useMemo(() => addSettings(), []);
  const [link, setLink] = useState("");
  const [directory, setDirectory] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The clipboard is read on mount and the field stays editable: this is a view
  // command, so the clipboard works here where a no-view worker has none.
  useEffect(() => {
    void Clipboard.readText().then((text) => {
      if (looksLikeTorrent(text)) setLink(text.trim());
    });
    void session(client)
      .then((settings) => setDirectory(settings["download-dir"] ?? ""))
      .catch(() => {
        // The default stays empty; the daemon fills in its own directory.
      });
  }, [client]);

  async function submit(values: Form.Values): Promise<boolean> {
    const target = String(values.link ?? "").trim();
    if (target === "") {
      setError("Paste a magnet link or a path to a .torrent file.");
      return false;
    }

    setError("");
    setBusy(true);
    try {
      const torrent = await add(client, target, expandHome(String(values.directory ?? "")));
      if (torrent === undefined) {
        setBusy(false);
        setError("The daemon said yes but no torrent appeared. Check that the link is a real magnet or .torrent file.");
        return false;
      }

      if (values.start === false) await setStopped(client, [torrent.id], true);

      if (onAdded !== undefined) {
        onAdded(torrent);
        navigation.pop();
      } else {
        await popToRoot();
        await showHUD(`Added ${torrent.name}`);
      }
      return true;
    } catch (failure) {
      setBusy(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not add the torrent",
        message: failure instanceof Error ? failure.message : String(failure),
      });
      return false;
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle="Add Torrent"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Torrent"
            icon={Icon.Download}
            shortcut={Keyboard.Shortcut.Common.Save}
            onSubmit={submit}
          />
          <ActionPanel.Submenu title="Insert Quick Path" icon={Icon.Text} shortcut={{ modifiers: ["ctrl"], key: "q" }}>
            {quickPaths.map((entry, index) => (
              <Action
                key={entry}
                title={entry}
                shortcut={index < 9 ? { modifiers: ["ctrl"], key: String(index + 1) as "1" } : undefined}
                onAction={() => setDirectory(entry)}
              />
            ))}
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    >
      <Form.TextField
        id="link"
        title="Torrent"
        placeholder="magnet:?xt=… or /path/to/file.torrent"
        value={link}
        error={error === "" ? undefined : error}
        onChange={setLink}
      />
      <Form.TextField
        id="directory"
        title="Download Directory"
        placeholder="the daemon's default"
        value={directory}
        onChange={setDirectory}
      />
      <Form.Checkbox id="start" title="Start" label="Start downloading immediately" value={startNow} onChange={setStartNow} />
    </Form>
  );
}
