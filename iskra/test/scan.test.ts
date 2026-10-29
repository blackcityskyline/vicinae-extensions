import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScanError, runOcr, runQrScan } from "../src/lib/scan.ts";
import { ocrLanguageInstallCommand } from "../src/lib/tools-database.ts";
import { isCommandAvailable } from "../src/backends/utils.ts";

/**
 * OCR and QR scanning against the real `tesseract` and `zbarimg`.
 *
 * The part that can be wrong without failing loudly is telling "nothing in the
 * image" from "the tool failed": zbarimg exits 4 with no output for the first
 * and 1 for the second, and reading both as a failure turns every scan of an
 * empty region into an error. Images are generated with ImageMagick and
 * qrencode; a check whose tools are absent is skipped, not passed.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(
	name: string,
	body: () => Promise<string | void> | string | void,
): Promise<void> {
	try {
		const reason = await body();
		if (reason) {
			skipped += 1;
			console.log(`SKIP ${name} — ${reason}`);
			return;
		}
		passed += 1;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed += 1;
		console.log(`FAIL ${name}`);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
	}
}

const missing = (...tools: string[]): string | undefined => {
	const absent = tools.filter((tool) => !isCommandAvailable(tool));
	return absent.length > 0 ? `${absent.join(", ")} not installed` : undefined;
};

async function main(): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), "iskra-scan-"));
	const imageMagick = isCommandAvailable("magick") ? "magick" : "convert";

	const blank = join(dir, "blank.png");
	const text = join(dir, "text.png");
	const qr = join(dir, "qr.png");
	const hasMagick = isCommandAvailable(imageMagick);
	if (hasMagick) {
		execFileSync(imageMagick, ["-size", "100x100", "xc:white", blank]);
		execFileSync(imageMagick, [
			"-size", "320x100", "xc:white", "-pointsize", "32", "-fill", "black",
			"-draw", "text 10,60 'Hello Iskra 42'", text,
		]);
	}
	const hasQr = isCommandAvailable("qrencode");
	if (hasQr) execFileSync("qrencode", ["-o", qr, "https://example.com/x?a=1"]);

	await check("a QR code is decoded", async () => {
		const skip = missing("zbarimg", "qrencode");
		if (skip) return skip;
		assert.equal(await runQrScan(qr), "https://example.com/x?a=1");
	});

	await check("an image with no barcode is an empty answer, not a failure", async () => {
		const skip = missing("zbarimg") ?? (hasMagick ? undefined : "ImageMagick not installed");
		if (skip) return skip;
		assert.equal(await runQrScan(blank), "");
	});

	await check("a file zbarimg cannot read is reported with its reason", async () => {
		const skip = missing("zbarimg");
		if (skip) return skip;
		const notAnImage = join(dir, "not-an-image.png");
		writeFileSync(notAnImage, "plain text");
		await assert.rejects(
			() => runQrScan(notAnImage),
			(error: unknown) =>
				error instanceof ScanError && /^zbarimg failed: .*(ERROR|header)/i.test(error.message),
		);
		await assert.rejects(
			() => runQrScan(join(dir, "absent.png")),
			(error: unknown) => error instanceof ScanError && /zbarimg failed/.test(error.message),
		);
	});

	await check("text in an image is read, and an image with none is an empty answer", async () => {
		const skip = missing("tesseract") ?? (hasMagick ? undefined : "ImageMagick not installed");
		if (skip) return skip;
		assert.equal(await runOcr(text, "eng"), "Hello Iskra 42");
		assert.equal(await runOcr(blank, "eng"), "");
	});

	await check("a language with no data names the package that provides it", async () => {
		const skip = missing("tesseract") ?? (hasMagick ? undefined : "ImageMagick not installed");
		if (skip) return skip;
		// A code no distribution ships, so the check cannot be satisfied by what is installed.
		await assert.rejects(
			() => runOcr(text, "xx_none"),
			(error: unknown) =>
				error instanceof ScanError &&
				error.message.includes('"xx_none"') &&
				(error.installCommand === null || error.installCommand.includes("xx")),
		);
	});

	await check("a tool that is not installed is said so, not reported as a crash", async () => {
		const saved = process.env.PATH;
		process.env.PATH = join(dir, "empty");
		try {
			await assert.rejects(
				() => runOcr(text, "eng"),
				(error: unknown) => error instanceof ScanError && /tesseract is not installed/.test(error.message),
			);
			await assert.rejects(
				() => runQrScan(qr),
				(error: unknown) => error instanceof ScanError && /zbarimg is not installed/.test(error.message),
			);
		} finally {
			process.env.PATH = saved;
		}
	});

	await check("each package manager gets its own name for a language pack", () => {
		assert.equal(ocrLanguageInstallCommand("chi_sim", "pacman"), "sudo pacman -S tesseract-data-chi_sim");
		assert.equal(ocrLanguageInstallCommand("chi_sim", "apt"), "sudo apt install tesseract-ocr-chi-sim");
		assert.equal(ocrLanguageInstallCommand("chi_sim", "dnf"), "sudo dnf install tesseract-langpack-chi_sim");
		assert.equal(ocrLanguageInstallCommand("rus", "apt"), "sudo apt install tesseract-ocr-rus");
		assert.equal(ocrLanguageInstallCommand("rus", "brew"), "brew install tesseract-lang");
		assert.equal(ocrLanguageInstallCommand("rus", "winget"), null);
	});

	rmSync(dir, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
	if (failed > 0) process.exit(1);
}

void main();
