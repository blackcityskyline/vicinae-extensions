import { List, ActionPanel, Action, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { CATEGORIES } from "~/utils/defaults";
import { scanCandidates, queryDefaults, applyDefault } from "~/api/defaults";

type State = {
  defaults: Record<string, string | null>;
  candidates: Record<string, Array<{ id: string; name: string }>>;
  isLoading: boolean;
};

export default function ManageCommand() {
  const [state, setState] = useState<State>({
    defaults: {},
    candidates: {},
    isLoading: true,
  });

  async function load() {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const [cands, defs] = await Promise.all([scanCandidates(), queryDefaults()]);
      setState({ defaults: defs, candidates: cands, isLoading: false });
    } catch (e) {
      await showToast(Toast.Style.Failure, String(e));
      setState((s) => ({ ...s, isLoading: false }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSet(catKey: string, appId: string) {
    const ok = await applyDefault(catKey, appId);
    if (ok) {
      await showToast(Toast.Style.Success, "Default application updated");
      await load();
    } else {
      await showToast(Toast.Style.Failure, "Failed to set default application");
    }
  }

  const getIcon = (glyph: string) => {
    const map: Record<string, Icon> = {
      Globe01: Icon.Globe01,
      Envelope: Icon.Envelope,
      Calendar: Icon.Calendar,
      Folder: Icon.Folder,
      SpeakerHigh: Icon.SpeakerHigh,
      Video: Icon.Video,
      Image: Icon.Image,
      Text: Icon.Text,
      Download: Icon.Download,
    };
    return map[glyph] || Icon.AppWindow;
  };

  return (
    <List isLoading={state.isLoading} searchBarPlaceholder="Search categories">
      {CATEGORIES.map((cat) => {
        const current = state.defaults[cat.key];
        const cands = state.candidates[cat.key] || [];
        const currentName = current ? cands.find((c) => c.id === current)?.name || current : "None";
        return (
          <List.Item
            key={cat.key}
            title={(cat as any).title || cat.key}
            subtitle={currentName}
            icon={getIcon(cat.glyph)}
            actions={
              <ActionPanel>
                <ActionPanel.Submenu title="Set Default" icon={Icon.Checkmark} shortcut="edit">
                  {cands.length === 0 ? (
                    <Action title="No candidates found" onAction={() => {}} />
                  ) : (
                    cands.map((app) => (
                      <Action
                        key={app.id}
                        title={app.name}
                        icon={app.id === current ? Icon.Checkmark : Icon.AppWindow}
                        onAction={() => handleSet(cat.key, app.id)}
                      />
                    ))
                  )}
                </ActionPanel.Submenu>
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
