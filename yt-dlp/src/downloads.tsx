import { Action, ActionPanel, Icon, List, open, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import DownloadForm from "~/components/download-form";
import { cancelJob, deleteJob, fileOf, readJobs, startJob, stateOf, subtitleOf, titleOf, type Job } from "~/api/jobs";

const ICONS = {
  running: Icon.Download,
  done: Icon.CheckCircle,
  failed: Icon.XMarkCircle,
  cancelled: Icon.Stop,
} as const;

const LABELS = {
  running: "Downloading",
  done: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export default function DownloadsCommand() {
  const [jobs, setJobs] = useState<Job[]>(() => readJobs());
  const { push, pop } = useNavigation();

  useEffect(() => {
    // Only while this window is open: the downloads themselves are detached
    // and nothing here needs a timer once the list is closed.
    const interval = setInterval(() => setJobs(readJobs()), 1000);
    return () => clearInterval(interval);
  }, []);

  function refresh(): void {
    setJobs(readJobs());
  }

  function retry(job: Job): void {
    startJob({
      url: job.url,
      format: job.format,
      quality: job.quality,
      dir: job.dir,
      playlists: job.playlists,
      cookies: job.cookies,
      metadata: job.metadata,
      mutagen: job.mutagen,
      subtitleLanguage: job.subtitleLanguage,
      subtitleFormat: job.subtitleFormat,
    });
    refresh();
  }

  const newDownload = (
    <Action
      title="New Download"
      icon={Icon.Plus}
      shortcut="new"
      onAction={() => push(<DownloadForm onStarted={pop} />)}
    />
  );

  return (
    <List searchBarPlaceholder="Search the downloads">
      {jobs.map((job) => {
        const state = stateOf(job);
        const file = fileOf(job);
        return (
          <List.Item
            key={job.id}
            title={titleOf(job)}
            subtitle={subtitleOf(job)}
            icon={ICONS[state]}
            accessories={[{ text: LABELS[state] }]}
            actions={
              <ActionPanel>
                {state === "running" && (
                  <Action
                    title="Cancel Download"
                    icon={Icon.Stop}
                    style={Action.Style.Destructive}
                    shortcut="remove"
                    onAction={() => {
                      cancelJob(job);
                      refresh();
                    }}
                  />
                )}
                {file && state === "done" && (
                  <>
                    <Action title="Open File" icon={Icon.Play} shortcut="open" onAction={() => open(file)} />
                    <Action.ShowInFinder title="Show in File Manager" path={file} />
                  </>
                )}
                {state !== "running" && (
                  <Action title="Retry" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => retry(job)} />
                )}
                <Action title="Open Folder" icon={Icon.Folder} onAction={() => open(job.dir)} />
                <Action.CopyToClipboard title="Copy Link" content={job.url} shortcut="copy" />
                <Action
                  title="Remove From List"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut="remove-all"
                  onAction={() => {
                    deleteJob(job);
                    refresh();
                  }}
                />
                <ActionPanel.Section>{newDownload}</ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
      <List.EmptyView title="No downloads yet" description="Paste a link and pick a format." actions={<ActionPanel>{newDownload}</ActionPanel>} />
    </List>
  );
}
