import { ScanCommand } from "./components/ScanCommand";
import { getOcrLanguage } from "./lib/ocr-language";
import { runOcr } from "./lib/scan";

export default function OcrScan() {
	return (
		<ScanCommand
			scan={async (image) => runOcr(image, await getOcrLanguage())}
			resultTitle="OCR Result"
			nothingFound="No text detected"
		/>
	);
}
