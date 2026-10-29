import { ScanCommand } from "./components/ScanCommand";
import { runQrScan } from "./lib/scan";

export default function ScanQr() {
	return (
		<ScanCommand
			scan={runQrScan}
			resultTitle="QR Result"
			nothingFound="No QR code detected"
		/>
	);
}
