import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { GameState, Settings as GameSettings } from "../engine/types";

type Toggle = keyof GameSettings;

const NUMBERS: { key: Toggle; title: string; blurb: string }[] = [
  {
    key: "compactNumbers",
    title: "Compact Numbers",
    blurb: "Show 12.4K instead of 12,400 for credits, XP and item counts.",
  },
];

export function Settings(props: {
  state: GameState;
  onChange: (change: (s: GameState) => GameState) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const { settings } = props.state;
  const toggle = (key: keyof GameSettings) => () =>
    props.onChange((s) => ({ ...s, settings: { ...s.settings, [key]: !s.settings[key] } }));
  const row = (item: { key: Toggle; title: string; blurb: string }, note = "") => (
    <List.Item
      key={item.key}
      title={item.title}
      icon={settings[item.key] ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          tag: {
            value: settings[item.key] ? "On" : "Off",
            color: settings[item.key] ? Color.Green : Color.SecondaryText,
          },
        },
      ]}
      detail={<List.Item.Detail markdown={`# ${item.title}\n${item.blurb}${note}`} />}
      actions={
        <ActionPanel>
          <Action title={settings[item.key] ? "Disable" : "Enable"} icon={Icon.Switch} onAction={toggle(item.key)} />
        </ActionPanel>
      }
    />
  );
  return (
    <>
      <List.Section title="Numbers">{NUMBERS.map((item) => row(item))}</List.Section>
      <List.Section title="Save">
        <List.Item
          title="Copy Save to Clipboard"
          icon={Icon.CopyClipboard}
          detail={<List.Item.Detail markdown={"# Copy Save\nPuts a backup of your game on the clipboard as text."} />}
          actions={
            <ActionPanel>
              <Action title="Copy Save" icon={Icon.CopyClipboard} onAction={props.onExport} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Import Save from Clipboard"
          icon={Icon.Download}
          detail={
            <List.Item.Detail
              markdown={"# Import Save\nReplaces your game with a save you copied. You are asked first."}
            />
          }
          actions={
            <ActionPanel>
              <Action
                title="Import Save"
                icon={Icon.Download}
                style={Action.Style.Destructive}
                onAction={props.onImport}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </>
  );
}
