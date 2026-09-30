import ClipboardForm from "~/components/clipboard-form";

export default function EncodeUrl() {
  return <ClipboardForm label="URL Encode" placeholder="Text to encode" transform={encodeURIComponent} />;
}
