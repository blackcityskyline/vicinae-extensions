import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDateTokens } from "../src/lib/dateFormat.ts";
import { expandPath, type Preferences } from "../src/lib/preferences.ts";
import {
	loadRecentFiles,
	getSavePath,
	saveImageFile,
	TEMP_PATH,
} from "../src/lib/filesystem.ts";

/**
 * Where a screenshot lands, against a real filesystem.
 *
 * The naming rules are the part of the extension a user sees after every
 * capture and the only part that can silently write to the wrong place: an
 * unexpanded `~`, a doubled separator, a subfolder format that is not created,
 * a temp capture that is copied but never removed. Each check below writes into
 * a throwaway `$HOME`, so the assertions are about files that exist.
 */

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
	try {
		await body();
		passed += 1;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed += 1;
		console.log(`FAIL ${name}`);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
	}
}

const pad = (value: number): string => value.toString().padStart(2, "0");

/** Everything the save path reads, so a check can vary one field at a time. */
const prefs = (overrides: Partial<Preferences> = {}): Preferences =>
	({
		screenshot_path: "~/Pictures/Screenshots",
		screenshot_tool: "auto",
		annotation_tool: "none",
		use_editor: false,
		copy_to_clipboard: true,
		save_to_file: true,
		subfolder_format: "",
		filename_format: "%Y-%m-%d_%H-%M-%S",
		autoclose_vicinae: true,
		post_capture: "vicinae",
		...overrides,
	}) as Preferences;

async function main(): Promise<void> {
	const home = mkdtempSync(join(tmpdir(), "iskra-home-"));
	process.env.HOME = home;

	await check("~ is the configured home, not the real one", () => {
		assert.equal(expandPath("~"), home);
		assert.equal(expandPath("~/Pictures"), join(home, "Pictures"));
		assert.equal(expandPath("~/x/~/y"), join(home, "x/~/y"));
		assert.equal(expandPath("/var/tmp/shots"), "/var/tmp/shots");
		assert.equal(expandPath("relative/path"), "relative/path");
	});

	await check("date tokens carry today's local time and unknown ones survive", () => {
		// Two readings bracketing the call: the check must not fail when it runs
		// across a minute or midnight boundary.
		const stamp = (date: Date): string =>
			`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
				date.getHours(),
			)}-${pad(date.getMinutes())}`;

		const before = stamp(new Date());
		const formatted = formatDateTokens("%Y-%m-%d_%H-%M");
		const after = stamp(new Date());

		assert.ok(
			formatted === before || formatted === after,
			`${formatted} is neither ${before} nor ${after}`,
		);
		assert.equal(formatDateTokens("%y-%x"), "%y-%x");
		assert.match(formatDateTokens("%Y"), /^\d{4}$/);
		assert.match(formatDateTokens("%S"), /^\d{2}$/);
	});

	await check("save path is absolute, joined once, and ends in .png", () => {
		const custom = getSavePath(prefs(), "screenshot");
		assert.equal(custom, join(home, "Pictures/Screenshots/screenshot.png"));

		const generated = getSavePath(prefs());
		assert.ok(!generated.includes("//"), `doubled separator in ${generated}`);
		assert.ok(generated.endsWith(".png"));
		assert.equal(
			getSavePath(prefs({ screenshot_path: "/var/tmp/shots/" })),
			join("/var/tmp/shots", generated.slice(generated.lastIndexOf("/") + 1)),
		);
	});

	await check("subfolder format is expanded into the path", () => {
		const year = new Date().getFullYear().toString();
		const month = pad(new Date().getMonth() + 1);
		const path = getSavePath(
			prefs({ subfolder_format: "shots/%Y/%m", filename_format: "capture" }),
		);
		assert.equal(path, join(home, "Pictures/Screenshots", "shots", year, month, "capture.png"));
	});

	await check("an empty subfolder adds no directory", () => {
		const path = getSavePath(prefs({ subfolder_format: "", filename_format: "x" }));
		assert.equal(path, join(home, "Pictures/Screenshots", "x.png"));
	});

	await check("saving copies the bytes and creates missing directories", () => {
		const source = join(home, "source.png");
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
		writeFileSync(source, bytes);

		const dest = join(home, "deep", "nested", "shot.png");
		assert.equal(saveImageFile(source, dest), dest, "the save does not report where it put the file");

		assert.deepEqual(readFileSync(dest), bytes);
		assert.ok(readFileSync(source).length > 0, "a source that is not the temp capture must survive");
	});

	await check("saving the pending capture removes it", () => {
		writeFileSync(TEMP_PATH, Buffer.from([1, 2, 3]));
		const dest = join(home, "from-temp.png");
		saveImageFile(TEMP_PATH, dest);

		assert.equal(readFileSync(dest).length, 3);
		assert.throws(() => readFileSync(TEMP_PATH), "the temp capture outlived the save");
	});

	await check("recent files are the newest 20 images, subfolders included", () => {
		const base = join(home, "recent");
		mkdirSync(join(base, "nested"), { recursive: true });

		for (let index = 0; index < 25; index += 1) {
			const file = join(base, index % 2 === 0 ? "nested" : ".", `shot-${pad(index)}.png`);
			writeFileSync(file, "png");
			const when = 1_700_000_000 + index;
			utimesSync(file, when, when);
		}
		writeFileSync(join(base, "notes.txt"), "not an image");
		writeFileSync(join(base, "older.jpg"), "jpg");
		utimesSync(join(base, "older.jpg"), 1_600_000_000, 1_600_000_000);

		const recent = loadRecentFiles(base);
		assert.equal(recent.length, 20);
		assert.equal(recent[0], join(base, "nested", "shot-24.png"));
		assert.ok(!recent.some((file) => file.endsWith(".txt")));
		assert.ok(!recent.includes(join(base, "older.jpg")), "the oldest image should be past the cap");
		assert.equal(recent[19], join(base, "shot-05.png"));
	});

	await check("a directory that does not exist has no recent files", () => {
		assert.deepEqual(loadRecentFiles(join(home, "nothing-here")), []);
	});

	rmSync(home, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void main();
