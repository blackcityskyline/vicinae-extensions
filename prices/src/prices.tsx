import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  getPreferenceValues,
  openCommandPreferences,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import {
  chartUrl,
  cryptoIds,
  formatChange,
  formatPrice,
  fxPairs,
  readQuotes,
  stamp,
  type Quote,
} from "./api/quotes";

const REFRESH_MS = 60_000;

type Data = { crypto: Quote[]; fx: Quote[] };

/**
 * The Omarchy widget's tickers, as a list: crypto from CoinGecko, FX from Yahoo Finance with the
 * ECB's daily fixing as the fallback.
 *
 * The widget polls forever because a bar pill must be filled before it is looked at. A launcher
 * command is read when it is opened, so the requests happen on mount and once a minute while the
 * window stays open, and stop with it.
 */
export default function Prices() {
  const { crypto, vsCurrency, fxPairs: pairsSetting } = getPreferenceValues<Preferences.Prices>();
  const ids = cryptoIds(crypto);
  const pairs = fxPairs(pairsSetting);
  const quote = (vsCurrency ?? "usd").toLowerCase();

  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (ids.length === 0 && pairs.length === 0) {
      setData({ crypto: [], fx: [] });
      return;
    }
    let live = true;
    let busy = false;
    setError(undefined);

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await readQuotes({ cryptoIds: ids, vsCurrency: quote, pairs });
        if (live) {
          setData(next);
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
    };
    // The arrays are rebuilt from these strings on every render, so the strings are the identity.
  }, [generation, crypto, quote, pairsSetting]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  if (ids.length === 0 && pairs.length === 0) {
    return (
      <List navigationTitle="Prices" searchBarPlaceholder="Search tickers">
        <List.EmptyView
          icon={Icon.BankNote}
          title="Nothing configured"
          description="Set at least one CoinGecko coin id or one BASE/QUOTE pair in the command preferences. The defaults are bitcoin,ethereum and EUR/USD,GBP/USD."
          actions={
            <ActionPanel>
              <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!data) {
    if (error) {
      return (
        <List isLoading={false} navigationTitle="Prices">
          <List.EmptyView
            icon={Icon.Exclamationmark}
            title="Nothing to show"
            description={error}
            actions={
              <ActionPanel>
                <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
                <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
              </ActionPanel>
            }
          />
        </List>
      );
    }
    return <List isLoading navigationTitle="Prices" />;
  }

  const now = Date.now();

  return (
    <List isLoading={false} navigationTitle="Prices" searchBarPlaceholder="Search tickers">
      {error ? (
        <List.Section title="Status">
          <List.Item
            icon={Icon.Exclamationmark}
            title="Last refresh failed"
            subtitle={error}
            actions={
              <ActionPanel>
                <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}

      {ids.length > 0 ? (
        <List.Section title="Crypto" subtitle={`vs ${quote.toUpperCase()}`}>
          {data.crypto.map((entry) => (
            <QuoteRow key={entry.id} quote={entry} now={now} onRefresh={refresh} />
          ))}
          {data.crypto.length === 0 ? (
            <List.Item
              icon={Icon.Exclamationmark}
              title="No crypto quotes"
              subtitle={`CoinGecko has no price for ${ids.join(", ")}`}
              actions={<RowActions onRefresh={refresh} />}
            />
          ) : null}
        </List.Section>
      ) : null}

      {pairs.length > 0 ? (
        <List.Section title="FX" subtitle="Yahoo Finance, ECB reference rates as fallback">
          {data.fx.map((entry) => (
            <QuoteRow key={entry.id} quote={entry} now={now} onRefresh={refresh} />
          ))}
          {data.fx.length === 0 ? (
            <List.Item
              icon={Icon.Exclamationmark}
              title="No FX quotes"
              subtitle="Neither Yahoo Finance nor the ECB answered for these pairs"
              actions={<RowActions onRefresh={refresh} />}
            />
          ) : null}
        </List.Section>
      ) : null}
    </List>
  );
}

function tone(change: number | undefined) {
  if (change === undefined || Math.abs(change) < 0.005) return Color.SecondaryText;
  return change > 0 ? Color.Green : Color.Red;
}

function subtitleOf(quote: Quote, now: number): string {
  if (quote.kind === "crypto") return `CoinGecko · vs ${quote.currency}`;
  if (quote.source === "ECB") return `ECB reference rate${quote.date ? ` · ${quote.date}` : ""}`;
  return quote.at ? `Yahoo · ${stamp(quote.at, now)}` : "Yahoo";
}

function QuoteRow({ quote, now, onRefresh }: { quote: Quote; now: number; onRefresh: () => void }) {
  const change = formatChange(quote.change);
  const price = `${formatPrice(quote.price)} ${quote.currency}`;
  return (
    <List.Item
      icon={quote.kind === "crypto" ? Icon.Coin : Icon.BankNote}
      title={`${quote.label}  ${formatPrice(quote.price)}`}
      subtitle={subtitleOf(quote, now)}
      keywords={[quote.label, quote.currency, quote.source ?? "", String(quote.price)]}
      accessories={change ? [{ tag: { value: change, color: tone(quote.change) } }] : [{ text: quote.currency }]}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Chart" icon={Icon.LineChart} shortcut="open" url={chartUrl(quote)} />
          <Action.CopyToClipboard title="Copy Price" content={price} shortcut="copy" />
          <ActionPanel.Section>
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
            <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function RowActions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
      <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
    </ActionPanel>
  );
}
