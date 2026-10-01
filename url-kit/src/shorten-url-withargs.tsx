import ClipboardForm from "~/components/clipboard-form";
import { shorten } from "~/api/shorten";

/**
 * Upstream's `shorten-url-withargs`, for a link that arrives as a command argument:
 *
 *   vicinae 'vicinae://extensions/@black/url-kit/shorten-url-withargs?url=https://…'
 *
 * It is `view` rather than `no-view` because a `no-view` worker cannot write to the
 * clipboard on this machine — measured, `Clipboard.copy` reports success and leaves the
 * clipboard untouched — so upstream's shape would shorten the link and lose the result.
 * The form pre-fills from the argument and falls back to the clipboard when it is empty.
 */
export default function ShortenUrlFromArgument(props: { arguments: Arguments.ShortenUrlWithargs }) {
  return (
    <ClipboardForm
      label="Shorten URL"
      placeholder="URL to shorten"
      argument={props.arguments?.url}
      transform={shorten}
    />
  );
}
