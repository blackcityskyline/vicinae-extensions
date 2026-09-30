import ClipboardForm from "~/components/clipboard-form";
import { decodeUrl } from "~/utils/url";

export default function DecodeUrl() {
  return <ClipboardForm label="URL Decode" placeholder="URL to decode" transform={decodeUrl} />;
}
