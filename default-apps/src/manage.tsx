import { Action, ActionPanel, Icon, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { queryCategory, readDesktopApps, setDefault, XdgMimeMissing } from "~/api/defaults";
import { CATEGORIES, type Category, type CategoryKey } from "~/utils/categories";
import { applicationDirs, candidatesFor, type Candidate } from "~/utils/desktop";

const ICONS: Record<CategoryKey, Icon> = {
  browser: Icon.Globe01,
  mail: Icon.Envelope,
  calendar: Icon.Calendar,
  files: Icon.Folder,
  music: Icon.SpeakerHigh,
  video: Icon.Video,
  photos: Icon.Image,
  editor: Icon.Text,
  pdf: Icon.BlankDocument,
  archive: Icon.Folder,
  word: Icon.BlankDocument,
  torrent: Icon.Download,
};

type Current = { id: string | null; mixed: boolean };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export default function ManageCommand() {
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [current, setCurrent] = useState<Record<string, Current>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const readDefaults = useCallback(async () => {
    const answers = await Promise.all(CATEGORIES.map((category) => queryCategory(category)));
    setCurrent(Object.fromEntries(CATEGORIES.map((category, i) => [category.key, answers[i]!])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const apps = await readDesktopApps(applicationDirs(process.env));
      setCandidates(Object.fromEntries(CATEGORIES.map((category) => [category.key, candidatesFor(apps, category)])));
      await readDefaults();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [readDefaults]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(category: Category, app: Candidate) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Setting ${app.name}…` });
    try {
      await setDefault(category, app.id);
      toast.style = Toast.Style.Success;
      toast.title = `${app.name} is now the default ${category.title.toLowerCase()}`;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not set the default";
      toast.message = messageOf(e);
    }
    await readDefaults().catch((e) => setError(e));
  }

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title={error instanceof XdgMimeMissing ? "xdg-mime is not installed" : "Could not read the default applications"}
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Try Again" icon={Icon.ArrowClockwise} onAction={load} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={loading} searchBarPlaceholder="Search categories">
      {CATEGORIES.map((category) => {
        const offered = candidates[category.key] ?? [];
        const now = current[category.key];
        const name = now?.id ? (offered.find((app) => app.id === now.id)?.name ?? now.id) : "None";
        return (
          <List.Item
            key={category.key}
            title={category.title}
            subtitle={name}
            icon={ICONS[category.key]}
            accessories={[
              ...(now?.mixed ? [{ text: "Types disagree" }] : []),
              ...(offered.length === 0 && !loading ? [{ text: "No application found" }] : []),
            ]}
            actions={
              <ActionPanel>
                {offered.length > 0 && (
                  <ActionPanel.Submenu title="Set Default" icon={Icon.Checkmark} shortcut="edit">
                    {offered.map((app) => (
                      <Action
                        key={app.id}
                        title={app.name}
                        icon={app.id === now?.id ? Icon.Checkmark : Icon.AppWindow}
                        onAction={() => choose(category, app)}
                      />
                    ))}
                  </ActionPanel.Submenu>
                )}
                <Action title="Rescan Applications" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
