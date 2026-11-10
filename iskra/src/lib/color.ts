/**
 * Colour conversion for the picker. Kept out of the command so it can be
 * checked without `@vicinae/api`: the picker hands back one `#RRGGBB` string
 * and everything else is arithmetic on it.
 */

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface Hsl {
	h: number;
	s: number;
	l: number;
}

export interface Hsv {
	h: number;
	s: number;
	v: number;
}

export interface Cmyk {
	c: number;
	m: number;
	y: number;
	k: number;
}

/**
 * The picked colour from hyprpicker's stdout. The tool logs to stdout too, and
 * only the colour line has no `[LEVEL] ` prefix, so match the bare line instead
 * of taking the last one.
 */
export const parsePickedColor = (output: string): string | null => {
	for (const line of output.split(/\r?\n/)) {
		const match = /^\s*#([0-9a-f]{6})\s*$/i.exec(line);
		if (match) return `#${match[1]?.toUpperCase()}`;
	}
	return null;
};

export const hexToRgb = (hex: string): Rgb | null => {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = Number.parseInt(match[1] ?? "", 16);
	return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
};

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const delta = max - min;
	const lightness = (max + min) / 2;

	if (delta === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) };

	const saturation = delta / (1 - Math.abs(2 * lightness - 1));
	let hue: number;
	if (max === red) hue = ((green - blue) / delta) % 6;
	else if (max === green) hue = (blue - red) / delta + 2;
	else hue = (red - green) / delta + 4;
	hue *= 60;
	if (hue < 0) hue += 360;

	return {
		// Rounding 359.6 gives 360, which is the same angle as 0.
		h: Math.round(hue) % 360,
		s: Math.round(saturation * 100),
		l: Math.round(lightness * 100),
	};
};

export const formatRgb = ({ r, g, b }: Rgb): string => `rgb(${r}, ${g}, ${b})`;

export const formatHsl = ({ h, s, l }: Hsl): string => `hsl(${h}, ${s}%, ${l}%)`;

export const rgbToHsv = ({ r, g, b }: Rgb): Hsv => {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const delta = max - Math.min(red, green, blue);

	let hue = 0;
	if (delta !== 0) {
		if (max === red) hue = ((green - blue) / delta) % 6;
		else if (max === green) hue = (blue - red) / delta + 2;
		else hue = (red - green) / delta + 4;
		hue *= 60;
		if (hue < 0) hue += 360;
	}

	return {
		h: Math.round(hue) % 360,
		s: max === 0 ? 0 : Math.round((delta / max) * 100),
		v: Math.round(max * 100),
	};
};

export const formatHsv = ({ h, s, v }: Hsv): string => `hsv(${h}, ${s}%, ${v}%)`;

export const rgbToCmyk = ({ r, g, b }: Rgb): Cmyk => {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const black = 1 - Math.max(red, green, blue);
	// Pure black has no ink to describe; every component is 0 and K carries it.
	if (black === 1) return { c: 0, m: 0, y: 0, k: 100 };
	const share = (value: number) => Math.round(((1 - value - black) / (1 - black)) * 100);
	return { c: share(red), m: share(green), y: share(blue), k: Math.round(black * 100) };
};

/** Percent signs dropped: the list column is narrow and CMYK is always percentages. */
export const formatCmyk = ({ c, m, y, k }: Cmyk): string => `cmyk(${c}, ${m}, ${y}, ${k})`;

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
	const saturation = s / 100;
	const lightness = l / 100;
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const sector = (((h % 360) + 360) % 360) / 60;
	const second = chroma * (1 - Math.abs((sector % 2) - 1));
	const [red, green, blue] =
		sector < 1
			? [chroma, second, 0]
			: sector < 2
				? [second, chroma, 0]
				: sector < 3
					? [0, chroma, second]
					: sector < 4
						? [0, second, chroma]
						: sector < 5
							? [second, 0, chroma]
							: [chroma, 0, second];
	const base = lightness - chroma / 2;
	const channel = (value: number) => Math.round((value + base) * 255);
	return { r: channel(red), g: channel(green), b: channel(blue) };
};

export const toHex = ({ r, g, b }: Rgb): string =>
	`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** WCAG relative luminance, 0 for black and 1 for white. */
export const relativeLuminance = ({ r, g, b }: Rgb): number => {
	const linear = (value: number) => {
		const channel = value / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG contrast ratio, from 1:1 (same colour) to 21:1 (black on white). */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
	const first = relativeLuminance(a);
	const second = relativeLuminance(b);
	const [lighter, darker] = first >= second ? [first, second] : [second, first];
	return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Tints and shades along one hue: the colour mixed towards white and towards
 * black, so the palette stays in the same family.
 */
export const PALETTE_STEPS = [95, 85, 75, 65, 55, 45, 35, 25, 15, 5];

export type Harmony =
	| "shades"
	| "complementary"
	| "analogous"
	| "split"
	| "triadic"
	| "tetradic";

/** Each harmony as hue rotations from the picked colour, in degrees. */
export const HARMONIES: Record<Harmony, { title: string; rotations: number[] }> = {
	shades: { title: "Shades", rotations: [0] },
	complementary: { title: "Complementary", rotations: [0, 180] },
	analogous: { title: "Analogous", rotations: [-30, 0, 30] },
	split: { title: "Split Complementary", rotations: [0, 150, 210] },
	triadic: { title: "Triadic", rotations: [0, 120, 240] },
	tetradic: { title: "Tetradic", rotations: [0, 90, 180, 270] },
};

/** Tab order, and the order the cycle action walks. */
export const HARMONY_ORDER: Harmony[] = [
	"shades",
	"complementary",
	"analogous",
	"split",
	"triadic",
	"tetradic",
];

export interface Swatch {
	hex: string;
	label: string;
}

/** Ten cells shared as evenly as they divide: 2 hues 5+5, 3 hues 4+3+3, 4 hues 3+3+2+2. */
const share = (total: number, parts: number): number[] =>
	Array.from(
		{ length: parts },
		(_, index) => Math.floor(total / parts) + (index < total % parts ? 1 : 0),
	);

/** Evenly spaced lightness across the same span, whatever the step count. */
const stepsFor = (count: number): number[] =>
	count === PALETTE_STEPS.length
		? PALETTE_STEPS
		: Array.from({ length: count }, (_, index) =>
				Math.round(90 - (80 * index) / Math.max(count - 1, 1)),
			);

/**
 * The palette for one harmony. Always ten cells, so the image keeps its shape;
 * a grey has no hue to rotate, so it falls back to the neutral ladder.
 */
export const paletteFor = (hex: string, harmony: Harmony): Swatch[] => {
	const rgb = hexToRgb(hex);
	if (!rgb) return [];
	const { h, s } = rgbToHsl(rgb);

	if (s === 0) {
		return PALETTE_STEPS.map((l) => ({ hex: toHex(hslToRgb({ h, s, l })), label: `L ${l}%` }));
	}

	const { rotations } = HARMONIES[harmony];
	const counts = share(PALETTE_STEPS.length, rotations.length);
	const swatches: Swatch[] = [];
	rotations.forEach((rotation, index) => {
		const hue = (((h + rotation) % 360) + 360) % 360;
		const steps = stepsFor(counts[index] ?? 0);
		for (const l of steps) {
			swatches.push({
				hex: toHex(hslToRgb({ h: hue, s, l })),
				label: rotations.length === 1 ? `L ${l}%` : `${hue}° · L ${l}%`,
			});
		}
	});
	return swatches;
};

