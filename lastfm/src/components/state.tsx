import { getPreferenceValues, Icon, List } from "@vicinae/api";

export type Config = {
  apiKey: string;
  username: string;
  period: string;
};

/** What every command needs. The key is a password preference and has no default. */
export function useConfig(): Config {
  const { apiKey, username, period } = getPreferenceValues<Preferences>();
  return { apiKey: apiKey?.trim() ?? "", username: username?.trim() ?? "", period: period || "overall" };
}

/** Asking the API a question we already know the answer to is not a request. */
export function needsSettings(config: Config): boolean {
  return !config.apiKey || !config.username;
}

export function NoSettings() {
  return (
    <List.EmptyView
      title="Set up Last.fm first"
      description="Add your API key and Last.fm username in this extension's settings."
      icon={Icon.Cog}
    />
  );
}

export function Failed({ error }: { error: string }) {
  return <List.EmptyView title="Last.fm could not be reached" description={error} icon={Icon.XMarkCircle} />;
}

export function Nothing({ title, subtitle }: { title: string; subtitle: string }) {
  return <List.EmptyView title={title} description={subtitle} icon={Icon.Music} />;
}
