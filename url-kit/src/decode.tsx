import TransformForm from "~/components/transform-form";
import { decodeUrl } from "~/utils/url";

export default function DecodeUrl() {
  return <TransformForm label="URL Decode" placeholder="URL to decode" transform={decodeUrl} />;
}
