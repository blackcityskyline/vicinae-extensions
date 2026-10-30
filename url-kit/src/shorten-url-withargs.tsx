import TransformForm from "~/components/transform-form";
import { shorten } from "~/api/shorten";

/**
 * Shortens a link given as a command argument, so a script or a deeplink can start it:
 *
 *   vicinae 'vicinae://extensions/@black/url-kit/shorten-url-withargs?url=https://…'
 *
 * The field starts from the argument and falls back to the clipboard when it is empty.
 */
export default function ShortenUrlFromArgument(props: { arguments: Arguments.ShortenUrlWithargs }) {
  return (
    <TransformForm
      label="Shorten URL"
      placeholder="URL to shorten"
      argument={props.arguments?.url}
      transform={shorten}
    />
  );
}
