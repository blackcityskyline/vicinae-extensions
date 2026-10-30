import TransformForm from "~/components/transform-form";
import { shorten } from "~/api/shorten";

export default function ShortenUrl() {
  return <TransformForm label="Shorten URL" placeholder="URL to shorten" transform={shorten} />;
}
