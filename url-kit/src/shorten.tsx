import ClipboardForm from "~/components/clipboard-form";
import { shorten } from "~/api/shorten";

export default function ShortenUrl() {
  return <ClipboardForm label="Shorten URL" placeholder="URL to shorten" transform={shorten} />;
}
