import {
  Action,
  ActionPanel,
  Icon,
  LaunchProps,
  List,
  Toast,
  showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  download,
  listSources,
  play,
  resolveSourceUrl,
  search,
  type Source,
  type TrackedRow,
} from "~/api/doris";
import { dorisBinary } from "~/preferences";
import { absoluteTorrentUrl, saveTorrentFile } from "~/torrent-file";
import { escapeMarkdown } from "~/utils/format";

/** Long enough that a typed phrase is one search, not one per keystroke. */
const SETTLE_MS = 800;

/**
 * The pane's title. `#` is the renderer's h1 and eats half the pane; `###` is
 * the smallest heading it has, which keeps the release name readable next to
 * the facts without shouting.
 */
function heading(title: string): string {
  return `### ${escapeMarkdown(title)}`;
}

export default function SearchCommand(
  props: LaunchProps<{ arguments: Arguments.Search }>,
) {
  return <SearchList initialQuery={props.arguments.query?.trim() ?? ""} />;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function SearchList(props: { initialQuery: string }) {
  const bin = dorisBinary();
  const [query, setQuery] = useState(props.initialQuery);
  const [rows, setRows] = useState<TrackedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const reload = () => setReloads((count) => count + 1);

  // The registry is a local read and answers in milliseconds; it is what turns
  // a source's own relative link into an absolute one.
  useEffect(() => {
    let cancelled = false;
    listSources(bin)
      .then((found) => {
        if (!cancelled) setSources(found);
      })
      .catch(() => {
        // Without it the rows still list; only the page links stay raw.
      });
    return () => {
      cancelled = true;
    };
  }, [bin]);

  const text = query.trim();
  const canSearch = text.length >= 3;

  useEffect(() => {
    if (!canSearch) {
      setRows([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // One run per settled phrase: the CLI waits on every enabled tracker, so
    // a search per keystroke would stack minutes of work behind the box.
    const timer = setTimeout(() => {
      search(bin, text)
        .then((found) => {
          if (!cancelled) setRows(found);
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(messageOf(caught));
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bin, text, canSearch, reloads]);

  const emptyActions = (
    <ActionPanel>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut="refresh"
        onAction={reload}
      />
    </ActionPanel>
  );

  return (
    <List
      filtering
      isShowingDetail
      isLoading={isLoading}
      searchText={query}
      onSearchTextChange={setQuery}
      navigationTitle="Doris"
      searchBarPlaceholder="Search every tracker Doris has enabled — at least 3 characters"
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Search failed"
          description={error}
          actions={emptyActions}
        />
      ) : !canSearch ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Type a search phrase"
          description="Doris searches the trackers it has enabled; Enter plays a result, ctrl+shift+d sends it to Transmission."
        />
      ) : !isLoading && rows.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Nothing found"
          description={`No enabled tracker answered "${text}". Try a shorter phrase, or check them with doris sources.`}
          actions={emptyActions}
        />
      ) : (
        rows.map((row, index) => (
          <ResultItem
            key={`${row.source}:${row.info_hash || row.title}:${index}`}
            row={row}
            query={text}
            index={index}
            home={sources.find((source) => source.id === row.source)?.home ?? ""}
            onRefresh={reload}
          />
        ))
      )}
    </List>
  );
}

function ResultItem(props: {
  row: TrackedRow;
  query: string;
  index: number;
  home: string;
  onRefresh: () => void;
}) {
  const { row, query, index } = props;
  const bin = dorisBinary();

  async function startStream() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: row.magnet ? "Starting mpv" : "Asking the trackers again",
      message: row.magnet
        ? row.title
        : "This row has no magnet, so doris has to find it again.",
    });
    try {
      await play(bin, row, query, index);
      toast.style = Toast.Style.Success;
      toast.title = "Playing in mpv";
      toast.message = row.title;
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start the stream";
      toast.message = messageOf(caught);
    }
  }

  const torrentUrl = absoluteTorrentUrl(row);
  const pageUrl = resolveSourceUrl(row.page_url, props.home);

  async function saveToDisk() {
    if (!torrentUrl) return;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving the .torrent",
      message: row.title,
    });
    try {
      const path = await saveTorrentFile(torrentUrl, row.title);
      toast.style = Toast.Style.Success;
      toast.title = "Saved";
      toast.message = path;
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not save the .torrent";
      toast.message = messageOf(caught);
    }
  }

  async function sendToDownloads() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding to Transmission",
      message: row.title,
    });
    try {
      const id = await download(bin, row, query, index);
      toast.style = Toast.Style.Success;
      toast.title = `Added as #${id}`;
      toast.message = row.title;
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Nothing was added";
      toast.message = messageOf(caught);
    }
  }

  const facts: [string, string][] = [
    ["Source", row.source],
    ["Group", row.group ?? ""],
    ["Category", row.category],
    ["Uploader", row.uploader],
    ["Size", row.size],
    ["Seeds", `${row.seeds_n} (listed ${row.seeds})`],
    ["Leechers", String(row.leechers)],
    ["Date", row.date],
    ["Info hash", row.info_hash],
  ];

  return (
    <List.Item
      title={row.title}
      icon={row.magnet ? Icon.Download : Icon.Network}
      keywords={[row.source, row.group ?? "", row.uploader, row.category].filter(
        (word) => word.length > 0,
      )}
      detail={
        <List.Item.Detail
          markdown={
            `${heading(row.title)}\n\n${
              row.magnet
                ? `\`\`\`\n${row.magnet}\n\`\`\`\n\n_Copy Magnet puts it on the clipboard._`
                : "_No magnet: doris fetches this row's .torrent from its source when you play it._"
            }`
          }
          metadata={
            <List.Item.Detail.Metadata>
              {facts
                .filter(([, value]) => value.length > 0)
                .map(([title, value]) => (
                  <List.Item.Detail.Metadata.Label
                    key={title}
                    title={title}
                    text={value}
                  />
                ))}
              {pageUrl ? (
                <>
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.Link
                    title="Page"
                    target={pageUrl}
                    text={pageUrl}
                  />
                </>
              ) : null}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action title="Play in mpv" icon={Icon.Play} onAction={startStream} />
          <Action
            title="Download in Transmission"
            icon={Icon.Download}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
            onAction={sendToDownloads}
          />
          {torrentUrl ? (
            <Action
              title="Save .torrent"
              icon={Icon.BlankDocument}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
              onAction={saveToDisk}
            />
          ) : null}
          {row.magnet ? (
            <Action.CopyToClipboard
              title="Copy Magnet"
              icon={Icon.Link}
              shortcut="copy"
              content={row.magnet}
            />
          ) : null}
          {pageUrl ? (
            <Action.OpenInBrowser
              title="Open Release Page"
              icon={Icon.Network}
              shortcut="open"
              url={pageUrl}
            />
          ) : null}
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut="refresh"
            onAction={props.onRefresh}
          />
        </ActionPanel>
      }
    />
  );
}
