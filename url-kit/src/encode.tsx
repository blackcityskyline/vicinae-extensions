import TransformForm from "~/components/transform-form";

export default function EncodeUrl() {
  return <TransformForm label="URL Encode" placeholder="Text to encode" transform={encodeURIComponent} />;
}
