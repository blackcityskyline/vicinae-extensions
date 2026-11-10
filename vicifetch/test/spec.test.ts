import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { artMarkdown, cleanLogoArt, logoArt } from "../src/utils/logo.ts";
import { stripJsonComments } from "../src/utils/jsonc.ts";
import { parseOsRelease } from "../src/utils/os-release.ts";
import { ageInDays, parseInstallDate } from "../src/utils/pacman.ts";
import { swatchPng, swatchSize } from "../src/utils/palette-image.ts";
import { knownShell, layerOwner, shellName } from "../src/utils/desktop-shell.ts";
import { buildSpec, type FastfetchModule } from "../src/utils/spec.ts";
import { parseAccents } from "../src/utils/theme-colors.ts";

let checks = 0;
function check(name: string, body: () => void) {
	try {
		body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

const fixture: FastfetchModule[] = JSON.parse(
	readFileSync(join(__dirname, "fixtures", "fastfetch.json"), "utf8"),
);

// The head of /var/lib/pacman/local/filesystem-*/desc as written by pacman 7.
const FILESYSTEM_DESC = `%NAME%
filesystem

%VERSION%
2025.10.12-1

%INSTALLDATE%
1779563469

%SIZE%
12232
`;

check("os-release unquotes values and keeps LOGO", () => {
	const parsed = parseOsRelease(
		'NAME="Arch Linux"\nID=arch\nLOGO=archlinux-logo\n# comment\nPRETTY_NAME=\'Arch Linux\'\n',
	);
	assert.equal(parsed.NAME, "Arch Linux");
	assert.equal(parsed.ID, "arch");
	assert.equal(parsed.LOGO, "archlinux-logo");
	assert.equal(parsed.PRETTY_NAME, "Arch Linux");
	assert.equal(parsed.comment, undefined);
});

check("pacman's install date is read from the line after %INSTALLDATE%", () => {
	assert.equal(parseInstallDate(FILESYSTEM_DESC), 1779563469);
	assert.equal(parseInstallDate("%NAME%\nfilesystem\n"), undefined);
	assert.equal(parseInstallDate("%INSTALLDATE%\nnot-a-number\n"), undefined);
});

check("age counts whole days and never goes negative", () => {
	assert.equal(ageInDays(0, 86_400_000), 1);
	assert.equal(ageInDays(0, 86_399_000), 0);
	assert.equal(ageInDays(2_000_000, 1_000_000), 0);
});

check("logo colour markers and trailing blanks are stripped", () => {
	assert.equal(cleanLogoArt("$1abc  \n$2def\n\n"), "abc\ndef");
});

check("the art becomes a monospace span with hard breaks and kept gaps", () => {
	const art = artMarkdown(" /\\\n/  \\\n`o`");
	assert.match(art, /^<span style="font-family:monospace;font-size:\d+px">/);
	assert.ok(art.endsWith("</span>"));
	assert.ok(art.includes("/\\\\<br/>"));
	assert.ok(art.includes("\\`o\\`"));
	assert.ok(!art.includes("\n"));
	// Markdown would eat these: `_x_`/`*x*` become emphasis, `<Home` a tag.
	assert.ok(
		artMarkdown("_yYsy_Qm*l}*<Home>&amp;[x]~y").includes(
			"\\_yYsy\\_Qm\\*l}\\*\\<Home\\>\\&amp;\\[x\\]\\~y",
		),
	);
});

check("theme accents come out in palette order, shaded and deduplicated", () => {
	const toml = [
		"[colors.core]",
		'accent = "#afc6ff"',
		"",
		"[colors.accents]",
		'red = "#ffb4ab"',
		'blue = "#afc6ff"',
		'orange = { name = "#ffb4ab", lighter = 40 }',
		'green = { name = "#ffffff", darker = 100 }',
		'yellow = { name = "not-a-colour" }',
		"",
		"[colors.text]",
		'default = "#000000"',
	].join("\n");
	assert.deepEqual(parseAccents(toml), [
		{ name: "blue", hex: "#afc6ff" },
		{ name: "green", hex: "#808080" },
		{ name: "orange", hex: "#ffb4ab" },
	]);
	assert.deepEqual(parseAccents(""), []);
});

check("the launcher's settings.json is read with its // comments", () => {
	const text = '// written by vicinae\n{ "theme": { "dark": { "name": "dch" } }, "url": "https://x//y" }';
	const parsed = JSON.parse(stripJsonComments(text)) as { theme: { dark: { name: string } }; url: string };
	assert.equal(parsed.theme.dark.name, "dch");
	assert.equal(parsed.url, "https://x//y");
});

check("the palette becomes a PNG of the size the markdown image is told", () => {
	const png = swatchPng(["#afc6ff", "#ffb4ab", "#bad1"]);
	assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
	assert.equal(png.readUInt32BE(16), 20 * 2 + 4);
	assert.equal(png.readUInt32BE(20), 20);
	assert.deepEqual(swatchSize(2), { width: 44, height: 20 });
	assert.equal(swatchPng(["#bad1"]).length, 0);
});

check("the Logo module of the same run becomes clean art", () => {
	const modules: FastfetchModule[] = [{ type: "Logo", result: { lines: "$1 /\\\n/  \\\n" } }];
	assert.equal(logoArt(modules), " /\\\n/  \\");
	assert.equal(logoArt([{ type: "Logo" }]), undefined);
	assert.equal(logoArt([]), undefined);
});

check("the measured modules become the requested lines", () => {
	const spec = buildSpec(fixture, { osAgeDays: 171, shell: "dms" });
	assert.equal(spec.user, "black@archlinux");
	assert.deepEqual(spec.facts, [
		{ label: "OS", value: "Arch Linux" },
		{ label: "Kernel", value: "6.18.59-1-lts" },
		{ label: "WM/DE", value: "Hyprland 0.56.2" },
		{ label: "Packages", value: "1673 (pacman)" },
		{ label: "Shell", value: "dms" },
		{ label: "OS age", value: "171 days" },
	]);
	assert.equal(
		spec.summary,
		"black@archlinux\nOS: Arch Linux\nKernel: 6.18.59-1-lts\nWM/DE: Hyprland 0.56.2\nPackages: 1673 (pacman)\nShell: dms\nOS age: 171 days",
	);
	assert.deepEqual(
		buildSpec(fixture, { osAgeDays: 171 }).facts.map((row) => row.label),
		["OS", "Kernel", "WM/DE", "Packages", "OS age"],
	);
});

check("uptime, the launcher version and font fill the column", () => {
	const modules: FastfetchModule[] = [
		{ type: "Uptime", result: { uptime: 2 * 86_400_000 + 3 * 3_600_000 } },
		{ type: "Font", result: { fonts: ["Noto Sans (10pt) [Qt]", "Noto Sans (10pt) [GTK2/3/4]"] } },
	];
	assert.deepEqual(buildSpec(modules, { launcher: "v0.29.2" }).facts, [
		{ label: "Uptime", value: "2d 3h" },
		{ label: "Vicinae", value: "v0.29.2" },
		{ label: "Font", value: "Noto Sans (10pt)" },
	]);
	assert.deepEqual(buildSpec([{ type: "Uptime", result: { uptime: 5 * 3_600_000 + 12 * 60_000 } }]).facts, [
		{ label: "Uptime", value: "5h 12m" },
	]);
});

check("the desktop shell is whoever paints the most layer surfaces", () => {
	const layers = {
		"DP-1": {
			levels: {
				"2": [
					{ pid: 10, namespace: "dms:bar" },
					{ pid: 10, namespace: "dms:dock" },
					{ pid: 11, namespace: "notify" },
				],
				"3": [{ pid: 10, namespace: "dms:dankisland" }, { pid: 12, namespace: "switcher" }],
			},
		},
		"HDMI-A-1": { levels: { "2": [{ pid: 10, namespace: "dms:bar" }] } },
	};
	assert.equal(layerOwner(layers), 10);
	assert.equal(layerOwner({}), undefined);
	assert.equal(layerOwner(undefined), undefined);
	// `dms` runs its quickshell under the generic name `qs`; the child is the owner.
	const processes = [
		{ pid: 5, ppid: 1, comm: "dms" },
		{ pid: 10, ppid: 5, comm: "qs" },
	];
	assert.equal(shellName(processes, 10), "dms");
	assert.equal(shellName([{ pid: 10, ppid: 1, comm: "waybar" }], 10), "waybar");
	assert.equal(shellName([], 10), undefined);
});

check("with no compositor answer only a known shell process names itself", () => {
	assert.equal(knownShell([{ comm: "firefox" }, { comm: "waybar" }]), "waybar");
	assert.equal(knownShell([{ comm: "dms" }, { comm: "qs" }]), "dms");
	assert.equal(knownShell([{ comm: "firefox" }]), undefined);
});

check("a shell is shown only when one was found", () => {
	assert.deepEqual(buildSpec([], { shell: "noctalia-shell" }).facts, [
		{ label: "Shell", value: "noctalia-shell" },
	]);
	assert.deepEqual(buildSpec([], {}).facts, []);
});

check("a desktop environment outranks the window manager, and a missing age is skipped", () => {
	const modules: FastfetchModule[] = [
		{ type: "Title", result: { userName: "u", hostName: "h" } },
		{ type: "DE", result: { prettyName: "GNOME", version: "47" } },
		{ type: "WM", result: { prettyName: "Mutter", version: "47" } },
	];
	const spec = buildSpec(modules);
	assert.deepEqual(spec.facts, [{ label: "WM/DE", value: "GNOME 47" }]);
	assert.equal(spec.summary, "u@h\nWM/DE: GNOME 47");
});

check("an empty run still names the machine and never throws", () => {
	const spec = buildSpec([]);
	assert.equal(spec.user, "This machine");
	assert.deepEqual(spec.facts, []);
	assert.equal(spec.summary, "This machine");
});

console.log(`\n${checks} check(s) passed`);
if (process.exitCode) console.log("some checks failed");
