import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  environment,
  getPreferenceValues,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { join } from "node:path";

import { loadConfig, saveConfig, type Config } from "./api/config";
import { Session, type Account, type Position, type Snapshot } from "./api/ctrader";
import { SetupForm } from "./components/SetupForm";
import { lots, money, openedFor, percent, price, signedMoney, statusLine, tradingViewUrl } from "./utils/format";

const configPath = join(environment.supportPath, "config.json");
const REFRESH_MS = 10_000;

/**
 * The Omarchy widget, without the bar: unrealised P/L, the account's figures and every open
 * position, read while the window is open and not a second longer.
 *
 * The plugin keeps a systemd poller running all day because a bar pill has to be filled before it
 * is looked at. A launcher command is looked at when it is opened, so the connection starts here
 * and ends with the window.
 */
export default function CTraderPL() {
  const [config, setConfig] = useState<Config | null>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [generation, setGeneration] = useState(0);
  const { tradingViewExchange } = getPreferenceValues<Preferences.CtraderPl>();
  const { push } = useNavigation();

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  const setup = useCallback(() => push(<SetupForm path={configPath} onSaved={reload} />), [push, reload]);

  useEffect(() => {
    setConfig(loadConfig(configPath));
  }, [generation]);

  useEffect(() => {
    if (!config) return;
    setSnapshot(undefined);
    setError(undefined);
    const session = new Session(config, (next) => saveConfig(configPath, next));
    let live = true;
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await session.snapshot();
        if (live) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (cause) {
        if (live) setError((cause as Error).message);
      } finally {
        busy = false;
      }
    };

    void tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
      session.close();
    };
  }, [config]);

  const retry = useCallback(() => reload(), [reload]);

  if (config === null) {
    return (
      <List isLoading={false} navigationTitle="cTrader P/L">
        <List.EmptyView
          icon={Icon.Coins}
          title="Not connected"
          description="This command reads your own cTrader account through the Open API. It needs an application you create at openapi.ctrader.com, and one browser round trip."
          actions={
            <ActionPanel>
              <Action title="Connect Account" icon={Icon.Link} shortcut="open" onAction={setup} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!snapshot) {
    return (
      <List isLoading={!error} navigationTitle="cTrader P/L">
        {error ? (
          <List.EmptyView
            icon={Icon.Exclamationmark}
            title="Could not read the account"
            description={error}
            actions={
              <ActionPanel>
                <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={retry} />
                <Action title="Change Account" icon={Icon.Key} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={setup} />
              </ActionPanel>
            }
          />
        ) : null}
      </List>
    );
  }

  const { account, unrealized, positions } = snapshot;
  const tone = (value: number) => (Math.abs(value) < 0.005 ? Color.SecondaryText : value > 0 ? Color.Green : Color.Red);

  return (
    <List isLoading={false} navigationTitle="cTrader P/L" searchBarPlaceholder="Search positions">
      <List.Section title="Unrealised P/L">
        <List.Item
          icon={Icon.Coins}
          title={`${signedMoney(unrealized.net)}${unrealized.currency ? ` ${unrealized.currency}` : ""}`}
          subtitle={statusLine({ error, at: snapshot.at })}
          accessories={[{ tag: { value: percent(unrealized.returnPct), color: tone(unrealized.net) } }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Total" content={signedMoney(unrealized.net)} shortcut="copy" />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={retry} />
              <Action title="Change Account" icon={Icon.Key} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={setup} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title={`Account ${account.login}`.trim()}>
        {accountRows(account).map((row) => (
          <List.Item
            key={row.title}
            icon={Icon.Wallet}
            title={row.title}
            accessories={[{ text: row.amount }]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title={`Copy ${row.title}`} content={row.amount} shortcut="copy" />
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={retry} />
                <Action title="Change Account" icon={Icon.Key} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={setup} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title={`Positions (${positions.length})`}>
        {positions.map((position) => (
          <List.Item
            key={position.id}
            icon={position.side === "BUY" ? Icon.ArrowUp : Icon.ArrowDown}
            title={describe(position)}
            subtitle={detail(position)}
            accessories={[
              { text: { value: `${signedMoney(position.pnl)} ${account.currency}`.trim(), color: tone(position.pnl) } },
            ]}
            actions={<PositionActions position={position} exchange={tradingViewExchange ?? ""} onRefresh={retry} onChange={setup} />}
          />
        ))}
        {positions.length === 0 ? (
          <List.Item
            icon={Icon.Circle}
            title="No open positions"
            subtitle="The account is flat."
            actions={
              <ActionPanel>
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={retry} />
                <Action title="Change Account" icon={Icon.Key} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={setup} />
              </ActionPanel>
            }
          />
        ) : null}
      </List.Section>
    </List>
  );
}

function accountRows(account: Account): Array<{ title: string; amount: string }> {
  const suffix = account.currency ? ` ${account.currency}` : "";
  return [
    { title: "Balance", amount: `${money(account.balance)}${suffix}` },
    { title: "Equity", amount: `${money(account.equity)}${suffix}` },
    { title: "Used Margin", amount: `${money(account.usedMargin)}${suffix}` },
    { title: "Free Margin", amount: `${money(account.freeMargin)}${suffix}` },
  ];
}

function describe(position: Position): string {
  return `${position.symbol} · ${position.side} ${lots(position.lots)}`;
}

function detail(position: Position): string {
  const opened = openedFor(position.openedAt);
  const gross = `gross ${signedMoney(position.grossPnl)}`;
  return [price(position.openPrice, position.digits), opened ? `opened ${opened} ago` : "", gross, position.swap ? `swap ${signedMoney(position.swap)}` : ""].filter(Boolean).join(" · ");
}

function PositionActions({ position, exchange, onRefresh, onChange }: { position: Position; exchange: string; onRefresh: () => void; onChange: () => void }) {
  const chart = tradingViewUrl(position.symbol, exchange);
  return (
    <ActionPanel>
      {chart ? <Action.OpenInBrowser title="Open Chart" icon={Icon.LineChart} shortcut="open" url={chart} /> : null}
      <Action.CopyToClipboard title="Copy Value" content={signedMoney(position.pnl)} shortcut="copy" />
      <Action.CopyToClipboard title="Copy Symbol" content={position.symbol} shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }} />
      <ActionPanel.Section>
        <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
        <Action title="Change Account" icon={Icon.Key} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={onChange} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
