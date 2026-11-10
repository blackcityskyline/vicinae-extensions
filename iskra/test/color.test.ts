import assert from "node:assert/strict";
import {
	contrastRatio,
	formatCmyk,
	formatHsl,
	formatHsv,
	formatRgb,
	HARMONIES,
	HARMONY_ORDER,
	hexToRgb,
	hslToRgb,
	paletteFor,
	parsePickedColor,
	rgbToCmyk,
	rgbToHsl,
	rgbToHsv,
	relativeLuminance,
	toHex,
} from "../src/lib/color.ts";

/**
 * The picker's arithmetic, checked against independent vectors.
 *
 * hyprpicker prints `#RRGGBB` among its log lines, and the launcher shows and
 * copies the RGB and HSL forms derived from it. An off-by-one in the parsers
 * silently copies the wrong colour, so the expected HSL values come from
 * Python's `colorsys` rather than from this code.
 */

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
	try {
		body();
		passed += 1;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed += 1;
		console.log(`FAIL ${name}`);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
	}
}

check("finds the colour among hyprpicker's log lines", () => {
	const output = [
		"[LOG] Hyprpicker started",
		"[INFO] Selecting a colour",
		"#A1B2C3",
	]
		.join("\n");
	assert.equal(parsePickedColor(output), "#A1B2C3");
});

check("lowercase output is normalized", () => {
	assert.equal(parsePickedColor("#a1b2c3"), "#A1B2C3");
});

check("a cancelled pick carries no colour", () => {
	assert.equal(parsePickedColor("[LOG] Hyprpicker starting\n[LOG] Exiting"), null);
	assert.equal(parsePickedColor(""), null);
});

check("#12ab34 splits into RGB bytes", () => {
	assert.deepEqual(hexToRgb("#12AB34"), { r: 0x12, g: 0xab, b: 0x34 });
	assert.equal(hexToRgb("123"), null);
});

check("HSL matches the standard conversion", () => {
	const vectors: [string, [number, number, number]][] = [
		["#FF0000", [0, 100, 50]],
		["#00FF00", [120, 100, 50]],
		["#0000FF", [240, 100, 50]],
		["#FFFFFF", [0, 0, 100]],
		["#000000", [0, 0, 0]],
		["#808080", [0, 0, 50]],
		["#123456", [210, 65, 20]],
		["#A1B2C3", [210, 22, 70]],
		["#7F00FF", [270, 100, 50]],
		["#FF8000", [30, 100, 50]],
	];
	for (const [hex, expected] of vectors) {
		const rgb = hexToRgb(hex);
		assert.ok(rgb, `${hex} should parse`);
		const hsl = rgbToHsl(rgb);
		assert.deepEqual([hsl.h, hsl.s, hsl.l], expected, hex);
	}
});

check("rounding a hue just below 360 lands on 0", () => {
	// 359.7 degrees: red with a touch of blue.
	const hsl = rgbToHsl(hexToRgb("#FF0001")!);
	assert.equal(hsl.h, 0);
});

check("formats match CSS notation", () => {
	const rgb = hexToRgb("#123456")!;
	assert.equal(formatRgb(rgb), "rgb(18, 52, 86)");
	assert.equal(formatHsl(rgbToHsl(rgb)), "hsl(210, 65%, 20%)");
});

check("HSV and CMYK match colorsys", () => {
	const vectors: [string, [number, number, number], [number, number, number, number]][] = [
		["#123456", [210, 79, 34], [79, 40, 0, 66]],
		["#FF0000", [0, 100, 100], [0, 100, 100, 0]],
		["#808080", [0, 0, 50], [0, 0, 0, 50]],
		["#7F00FF", [270, 100, 100], [50, 100, 0, 0]],
	];
	for (const [hex, hsv, cmyk] of vectors) {
		const rgb = hexToRgb(hex)!;
		const { h, s, v } = rgbToHsv(rgb);
		const { c, m, y, k } = rgbToCmyk(rgb);
		assert.deepEqual([h, s, v], hsv, `hsv ${hex}`);
		assert.deepEqual([c, m, y, k], cmyk, `cmyk ${hex}`);
	}
	assert.equal(formatHsv(rgbToHsv(hexToRgb("#123456")!)), "hsv(210, 79%, 34%)");
	assert.equal(formatCmyk(rgbToCmyk(hexToRgb("#123456")!)), "cmyk(79, 40, 0, 66)");
});

check("HSL converts back with colorsys vectors", () => {
	const vectors: [number, number, number, string][] = [
		[210, 65, 20, "#123354"],
		[0, 100, 50, "#FF0000"],
		[120, 100, 25, "#008000"],
		[0, 0, 50, "#808080"],
	];
	for (const [h, s, l, hex] of vectors) {
		assert.equal(toHex(hslToRgb({ h, s, l })), hex, `${h}, ${s}, ${l}`);
	}
});

check("contrast matches the WCAG definition", () => {
	const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.02, `${a} vs ${b}`);
	close(contrastRatio(hexToRgb("#000000")!, hexToRgb("#FFFFFF")!), 21);
	close(contrastRatio(hexToRgb("#123456")!, hexToRgb("#FFFFFF")!), 12.72);
	close(contrastRatio(hexToRgb("#777777")!, hexToRgb("#FFFFFF")!), 4.48);
});

check("shades walk the picked hue to white and to black", () => {
	const palette = paletteFor("#123456", "shades");
	assert.deepEqual(
		palette.map((swatch) => swatch.hex),
		[
			"#EAF2FB",
			"#C0D9F2",
			"#96BFE9",
			"#6CA6E0",
			"#428CD7",
			"#2873BD",
			"#1F5993",
			"#164069",
			"#0D263F",
			"#040D15",
		],
	);
	const luminances = palette.map((swatch) => relativeLuminance(hexToRgb(swatch.hex)!));
	assert.ok(luminances[0]! > 0.8, "the first step is nearly white");
	assert.ok(luminances.at(-1)! < 0.02, "the last step is nearly black");
	for (let i = 1; i < luminances.length; i += 1) {
		assert.ok(luminances[i]! < luminances[i - 1]!, "steps get darker");
	}
	assert.deepEqual(paletteFor("nope", "shades"), []);
});

check("every harmony rotates the picked hue and keeps ten cells", () => {
	const circularDistance = (a: number, b: number) => {
		const distance = Math.abs(a - b) % 360;
		return Math.min(distance, 360 - distance);
	};
	const hueOf = (hex: string) => rgbToHsl(hexToRgb(hex)!).h;
	for (const harmony of HARMONY_ORDER) {
		const palette = paletteFor("#123456", harmony);
		assert.equal(palette.length, 10, `${harmony} has ten cells`);
		const expected = HARMONIES[harmony].rotations.map(
			(rotation) => (((210 + rotation) % 360) + 360) % 360,
		);
		for (const angle of expected) {
			// Rounded RGB shifts the hue by a degree or two; the angle must still be there.
			assert.ok(
				palette.some((swatch) => circularDistance(hueOf(swatch.hex), angle) <= 2),
				`${harmony} has ${angle}°`,
			);
		}
		for (const swatch of palette) {
			assert.ok(
				expected.some((angle) => circularDistance(hueOf(swatch.hex), angle) <= 2),
				`${swatch.hex} belongs to ${harmony}`,
			);
		}
	}
	// Colorsys vectors: ten cells shared 4+3+3 over 0°, 120° and 240°.
	const triadic = paletteFor("#123456", "triadic").map((swatch) => swatch.hex);
	for (const hex of ["#215E9C", "#D22D80", "#80D22D"]) {
		assert.ok(triadic.includes(hex), `triadic keeps ${hex}`);
	}
	// Four hues: 3+3+2+2.
	const tetradic = paletteFor("#123456", "tetradic").map((swatch) => swatch.hex);
	for (const hex of ["#D22DD2", "#2A1A09", "#092A09"]) {
		assert.ok(tetradic.includes(hex), `tetradic keeps ${hex}`);
	}
	const countNear = (hexes: string[], angles: number[]) =>
		angles.map(
			(angle) =>
				hexes.filter((hex) => circularDistance(hueOf(hex), angle) <= 3).length,
		);
	assert.deepEqual(countNear(triadic, [210, 330, 90]), [4, 3, 3]);
	assert.deepEqual(countNear(tetradic, [210, 300, 30, 120]), [3, 3, 2, 2]);
});

check("a rotation wraps around zero", () => {
	// #D92644 sits at 350°, so the analogous triple runs 320°, 350° and 20°,
	// the last of which is 350 + 30 past the end of the wheel.
	const hues = paletteFor("#D92644", "analogous").map(
		(swatch) => rgbToHsl(hexToRgb(swatch.hex)!).h,
	);
	const near = (angle: number) =>
		hues.filter((hue) => {
			const distance = Math.abs(hue - angle) % 360;
			return Math.min(distance, 360 - distance) <= 2;
		}).length;
	assert.ok(near(320) > 0, "320°");
	assert.ok(near(350) > 0, "350°");
	assert.ok(near(20) > 0, "20°");
});

check("a grey has no hue to rotate", () => {
	const neutral = paletteFor("#808080", "shades");
	for (const harmony of HARMONY_ORDER) {
		assert.deepEqual(paletteFor("#808080", harmony), neutral, harmony);
	}
	for (const swatch of neutral) {
		const { r, g, b } = hexToRgb(swatch.hex)!;
		assert.equal(r, g, `${swatch.hex} stays neutral`);
		assert.equal(g, b, `${swatch.hex} stays neutral`);
	}
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
