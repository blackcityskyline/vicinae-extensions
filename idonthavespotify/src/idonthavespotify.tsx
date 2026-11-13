import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  List,
  getPreferenceValues,
  openCommandPreferences,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  convert,
  isSupportedLink,
  serviceLabel,
  typeLabel,
  usableLinks,
  type Conversion,
} from "./api/idhs";

const SERVICES = "Spotify, YouTube, Apple Music, Deezer, SoundCloud, Tidal, Qobuz, Bandcamp, Pandora, JioSaavn, Apple Podcasts and Google share links";

/**
 * The Raycast extension's list, with the request only sent for a complete supported link.
 *
 * Upstream searches on every keystroke; a launcher sends the same request, but the link is
 * validated locally first, so typing a URL costs one request when it is finished rather than one
 * per character against a possibly slow self-hosted instance.
 */
export default function IdontHavespotify() {
  const { instanceUrl } = getPreferenceValues<Preferences.Idonthavespotify>();
  const base = (instanceUrl ?? "").trim();

  const [text, setText] = useState("");
  const [result, setResult] = useState<Conversion>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastLink = useRef("");

  const run = useCallback(
    async (link: string) => {
      if (!base) return;
      lastLink.current = link;
      setLoading(true);
      try {
        const conversion = await convert(base, link);
        setResult(conversion);
        setError(undefined);
      } catch (cause) {
        setResult(undefined);
        setError((cause as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    void (async () => {
      const link = (await Clipboard.readText()).trim();
      if (!isSupportedLink(link)) return;
      setText(link);
      await run(link);
    })();
  }, [run]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const retry = useCallback(() => {
    if (isSupportedLink(text.trim())) void run(text.trim());
  }, [run, text]);

  function changeLink(value: string) {
    setText(value);
    clearTimeout(timer.current);
    const link = value.trim();
    if (!link) {
      lastLink.current = "";
      setResult(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    if (!isSupportedLink(link)) {
      setResult(undefined);
      setError(undefined);
      return;
    }
    if (link === lastLink.current) return;
    setResult(undefined);
    setError(undefined);
    timer.current = setTimeout(() => void run(link), 350);
  }

  const retryable = isSupportedLink(text.trim());
  const preferences = <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />;

  if (!base) {
    return (
      <List navigationTitle="I Don't Have Spotify">
        <List.EmptyView
          icon={Icon.Cog}
          title="Set your instance"
          description="This command asks a self-hosted I Don't Have Spotify instance to convert the link; the public site refuses programmatic search. Set its base URL in the command preferences."
          actions={<ActionPanel>{preferences}</ActionPanel>}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      navigationTitle="I Don't Have Spotify"
      searchBarPlaceholder="Paste a music link"
      filtering={false}
      onSearchTextChange={changeLink}
    >
      {!result && !error ? (
        <List.EmptyView
          icon={Icon.Link}
          title={text.trim() ? "Not a supported link" : "Paste a music link"}
          description={text.trim() ? SERVICES : `A link from ${SERVICES}. The clipboard is read when the window opens.`}
          actions={<ActionPanel>{preferences}</ActionPanel>}
        />
      ) : null}

      {!result && error ? (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Could not convert the link"
          description={error}
          actions={
            <ActionPanel>
              {retryable ? <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={retry} /> : null}
              {preferences}
            </ActionPanel>
          }
        />
      ) : null}

      {result ? (
        <>
          <List.Section title={typeLabel(result.type)}>
            <List.Item
              icon={result.image ? { source: result.image } : Icon.Music}
              title={result.title}
              subtitle={result.description || result.source}
              actions={
                <ActionPanel>
                  {result.universalLink ? (
                    <Action.OpenInBrowser title="Open on Website" icon={Icon.Link} shortcut="open" url={result.universalLink} />
                  ) : null}
                  {result.universalLink ? <Action.CopyToClipboard title="Copy Universal Link" content={result.universalLink} shortcut="copy" /> : null}
                  {preferences}
                </ActionPanel>
              }
            />
          </List.Section>

          <List.Section title={usableLinks(result).length > 0 ? "Listen on" : "Result"}>
            {usableLinks(result).length === 0 ? (
              <List.Item icon={Icon.Exclamationmark} title="Not available on other platforms" actions={<ActionPanel>{preferences}</ActionPanel>} />
            ) : null}
            {usableLinks(result).map((link) => (
              <List.Item
                key={link.type}
                icon={Icon.Link}
                title={serviceLabel(link.type)}
                subtitle={link.url}
                keywords={[link.type]}
                accessories={link.isVerified ? [{ icon: Icon.CheckCircle }] : []}
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser title="Open" icon={Icon.Link} shortcut="open" url={link.url} />
                    <Action.CopyToClipboard title="Copy Link" content={link.url} shortcut="copy" />
                    <ActionPanel.Section>{preferences}</ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        </>
      ) : null}
    </List>
  );
}
