import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { listSources, setSourceEnabled, type Source } from "~/api/doris";
import { dorisBinary } from "~/preferences";

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export default function SourcesCommand() {
  const bin = dorisBinary();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((count) => count + 1);

  useEffect(() => {
    let cancelled = false;
    setSources(null);
    setError(null);
    listSources(bin)
      .then((found) => {
        if (!cancelled) setSources(found);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [bin, reloads]);

  const enabledCount = (sources ?? []).filter((source) => source.enabled).length;

  return (
    <List
      isLoading={sources === null && error === null}
      navigationTitle="Doris Trackers"
      searchBarPlaceholder={
        sources
          ? `${enabledCount} of ${sources.length} on · Enter switches the selected one, ctrl+r refreshes`
          : "Asking doris what it has"
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="doris sources failed"
          description={error}
        />
      ) : (sources ?? []).length === 0 && sources !== null ? (
        <List.EmptyView
          icon={Icon.Network}
          title="No sources"
          description="doris reported an empty registry."
        />
      ) : (
        (sources ?? []).map((source) => (
          <SourceItem key={source.id} source={source} onRefresh={reload} />
        ))
      )}
    </List>
  );
}

function SourceItem(props: { source: Source; onRefresh: () => void }) {
  const { source } = props;
  const bin = dorisBinary();

  async function toggle() {
    const enabled = !source.enabled;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: enabled ? "Switching on" : "Switching off",
      message: source.label,
    });
    try {
      await setSourceEnabled(bin, source.id, enabled);
      toast.style = Toast.Style.Success;
      toast.title = enabled ? "On" : "Off";
      toast.message = source.label;
      props.onRefresh();
    } catch (caught) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not change it";
      toast.message = messageOf(caught);
    }
  }

  const facts = [
    source.id,
    source.groups.join(", "),
    source.browser ? "needs a browser" : "",
    source.implemented ? "" : "not implemented yet",
  ].filter((part) => part.length > 0);

  return (
    <List.Item
      title={source.label}
      subtitle={facts.join(" · ")}
      icon={source.enabled ? Icon.CheckCircle : Icon.Circle}
      keywords={[source.id, ...source.groups]}
      actions={
        <ActionPanel>
          <Action
            title={source.enabled ? "Switch Off" : "Switch On"}
            icon={source.enabled ? Icon.Circle : Icon.CheckCircle}
            shortcut={{ modifiers: ["ctrl"], key: "t" }}
            onAction={toggle}
          />
          {source.home ? (
            <Action.OpenInBrowser
              title="Open Home Page"
              icon={Icon.Network}
              shortcut="open"
              url={source.home}
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
