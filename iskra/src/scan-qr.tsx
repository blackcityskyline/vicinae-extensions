import React from "react";
import { performScan, runQrScan } from "./lib/ocr/tools";
import { OCRResult } from "./components/OCRResult";

export default function Command() {
	const [resultText, setResultText] = React.useState<string | null>(null);

	React.useEffect(() => {
		(async () => {
			const text = await performScan(async (imagePath) => {
				return await runQrScan(imagePath);
			}, "No QR code detected");
			if (text) setResultText(text);
		})();
	}, []);

	if (resultText !== null) {
		return (
			<OCRResult
				text={resultText}
				title="QR Result"
				placeholder="No QR code detected"
				onClose={() => setResultText(null)}
			/>
		);
	}

	return null;
}
