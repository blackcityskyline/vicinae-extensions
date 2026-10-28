import React from "react";
import { performScan, runOcr } from "./lib/ocr/tools";
import { OCRResult } from "./components/OCRResult";

export default function Command() {
	const [resultText, setResultText] = React.useState<string | null>(null);

	React.useEffect(() => {
		(async () => {
			const text = await performScan(async (imagePath) => {
				return await runOcr(imagePath);
			}, "No text detected");
			if (text) setResultText(text);
		})();
	}, []);

	if (resultText !== null) {
		return <OCRResult text={resultText} onClose={() => setResultText(null)} />;
	}

	return null;
}
