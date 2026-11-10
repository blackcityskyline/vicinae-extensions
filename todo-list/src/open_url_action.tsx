import { Action, Icon, Keyboard } from "@vicinae/api";
import { URL } from "url";

const OpenUrlAction = ({ url, shortcut, title }: { url: string; shortcut?: Keyboard.Shortcut; title?: string }) => {
  let resolvedUrl = url;
  try {
    new URL(url);
  } catch {
    try {
      resolvedUrl = `https://${url}`;
    } catch {
      return null;
    }
  }

  return (
    <>
      <Action.OpenInBrowser icon={Icon.Globe01} shortcut={shortcut} title={title ?? url} url={resolvedUrl} />
    </>
  );
};

export default OpenUrlAction;
