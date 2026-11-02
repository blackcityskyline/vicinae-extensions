import { execFileSync } from "node:child_process";
import {
	chmodSync,
	closeSync,
	constants,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readSync,
	rmSync,
	statSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * HyprCapture's export pipe. Measured on Hyprland 0.56.2 + HyprCapture 0.4.2
 * (docs/audits/hyprcapture.md): the request is one JSON line on a FIFO, the
 * answer is `HYPRCAP_PIPE_V1`, a decimal header length, the JSON header and one
 * RGBA8888 frame per monitor. `hyprctl eval` returns before the frame is
 * written, so the reader owns the timeout.
 */

const MAGIC = "HYPRCAP_PIPE_V1\n";
const PROTOCOL_VERSION = 1;
const READ_TIMEOUT_MS = 30_000;
const MAX_HEADER_BYTES = 64 * 1024;
const READ_CHUNK = 1 << 20;

export class HyprCapturePipeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HyprCapturePipeError";
	}
}

export type PipeMonitor = {
	name: string;
	geometry: { x: number; y: number; width: number; height: number };
	scale: number;
	transform: number;
	artifactWidth: number;
	artifactHeight: number;
	byteLength: number;
};

export type PipeHeader = {
	version: number;
	format: string;
	topDown: boolean;
	monitors: PipeMonitor[];
};

export type PipeResponse = {
	header: PipeHeader;
	frames: Buffer[];
};

export type Rect = { x: number; y: number; width: number; height: number };

export type Image = {
	width: number;
	height: number;
	rgba: Buffer;
	/** Global logical coordinate of pixel (0,0). */
	originX: number;
	originY: number;
	/** Image pixels per logical pixel. */
	scaleX: number;
	scaleY: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown, field: string): number => {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new HyprCapturePipeError(`HyprCapture pipe header has no usable ${field}`);
	}
	return value;
};

const finiteNumber = (value: unknown, field: string): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new HyprCapturePipeError(`HyprCapture pipe header has no usable ${field}`);
	}
	return value;
};

/** Header length and JSON, or null while the prefix is still incomplete. */
const readHeader = (
	data: Buffer,
): { header: Record<string, unknown>; end: number } | null => {
	if (data.length < MAGIC.length) {
		if (MAGIC.startsWith(data.toString("latin1"))) return null;
		throw new HyprCapturePipeError("HyprCapture pipe response has the wrong magic");
	}
	if (data.toString("latin1", 0, MAGIC.length) !== MAGIC) {
		throw new HyprCapturePipeError("HyprCapture pipe response has the wrong magic");
	}

	const lengthEnd = data.indexOf(0x0a, MAGIC.length);
	if (lengthEnd < 0) return null;
	const lengthText = data.toString("ascii", MAGIC.length, lengthEnd);
	if (!/^\d+$/.test(lengthText)) {
		throw new HyprCapturePipeError("HyprCapture pipe header length is not a decimal number");
	}
	const headerLength = Number(lengthText);
	if (!Number.isSafeInteger(headerLength) || headerLength > MAX_HEADER_BYTES) {
		throw new HyprCapturePipeError(`HyprCapture pipe header length ${lengthText} is out of range`);
	}

	const headerStart = lengthEnd + 1;
	const end = headerStart + headerLength;
	if (data.length < end) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(data.toString("utf8", headerStart, end));
	} catch {
		throw new HyprCapturePipeError("HyprCapture pipe header is not valid JSON");
	}
	if (!isRecord(parsed)) {
		throw new HyprCapturePipeError("HyprCapture pipe header is not a JSON object");
	}
	return { header: parsed, end };
};

/** How many bytes the complete response needs, or null until the header is whole. */
const declaredLength = (data: Buffer): number | null => {
	const read = readHeader(data);
	if (!read) return null;
	if (read.header.ok === false) {
		const reason = typeof read.header.error === "string" ? read.header.error : "unknown error";
		throw new HyprCapturePipeError(`HyprCapture export pipe failed: ${reason}`);
	}
	const monitors = read.header.monitors;
	if (!Array.isArray(monitors)) {
		throw new HyprCapturePipeError("HyprCapture pipe header has no monitors array");
	}
	let total = read.end;
	for (const monitor of monitors) {
		if (!isRecord(monitor)) {
			throw new HyprCapturePipeError("HyprCapture pipe header has a malformed monitor");
		}
		total += positiveInteger(monitor.byteLength, "monitor byteLength");
	}
	return total;
};

export const parsePipeResponse = (data: Buffer): PipeResponse => {
	const read = readHeader(data);
	if (!read) throw new HyprCapturePipeError("HyprCapture pipe response is truncated");
	const { header: raw, end } = read;

	if (raw.ok === false) {
		const reason = typeof raw.error === "string" ? raw.error : "unknown error";
		throw new HyprCapturePipeError(`HyprCapture export pipe failed: ${reason}`);
	}
	if (raw.ok !== true) {
		throw new HyprCapturePipeError("HyprCapture pipe header has no ok flag");
	}
	if (raw.version !== PROTOCOL_VERSION) {
		throw new HyprCapturePipeError(
			`unsupported HyprCapture pipe version ${String(raw.version)}; this build speaks ${PROTOCOL_VERSION}`,
		);
	}
	if (raw.format !== "rgba8888") {
		throw new HyprCapturePipeError(
			`unsupported HyprCapture pipe format ${String(raw.format)}; expected rgba8888`,
		);
	}
	if (typeof raw.topDown !== "boolean") {
		throw new HyprCapturePipeError("HyprCapture pipe header has no usable topDown flag");
	}
	if (!Array.isArray(raw.monitors) || raw.monitors.length === 0) {
		throw new HyprCapturePipeError("HyprCapture pipe header has no monitors");
	}

	const monitors: PipeMonitor[] = raw.monitors.map((monitor, index) => {
		if (!isRecord(monitor)) {
			throw new HyprCapturePipeError(`HyprCapture pipe monitor ${index} is not an object`);
		}
		const geometry = monitor.geometry;
		if (!isRecord(geometry)) {
			throw new HyprCapturePipeError(`HyprCapture pipe monitor ${index} has no geometry`);
		}
		const artifactWidth = positiveInteger(monitor.artifactWidth, "artifactWidth");
		const artifactHeight = positiveInteger(monitor.artifactHeight, "artifactHeight");
		const byteLength = positiveInteger(monitor.byteLength, "byteLength");
		if (byteLength !== artifactWidth * artifactHeight * 4) {
			throw new HyprCapturePipeError(
				`HyprCapture pipe monitor ${index} declares ${byteLength} bytes for ${artifactWidth}x${artifactHeight} RGBA`,
			);
		}
		return {
			name: typeof monitor.name === "string" ? monitor.name : `monitor-${index}`,
			geometry: {
				x: finiteNumber(geometry.x, "geometry.x"),
				y: finiteNumber(geometry.y, "geometry.y"),
				width: finiteNumber(geometry.width, "geometry.width"),
				height: finiteNumber(geometry.height, "geometry.height"),
			},
			scale: finiteNumber(monitor.scale, "scale"),
			transform: finiteNumber(monitor.transform, "transform"),
			artifactWidth,
			artifactHeight,
			byteLength,
		};
	});

	let cursor = end;
	const frames = monitors.map((monitor, index) => {
		const next = cursor + monitor.byteLength;
		if (next > data.length) {
			throw new HyprCapturePipeError(
				`HyprCapture pipe response is truncated at monitor ${index} (${data.length - cursor} of ${monitor.byteLength} bytes)`,
			);
		}
		const frame = data.subarray(cursor, next);
		cursor = next;
		return frame;
	});

	return {
		header: {
			version: PROTOCOL_VERSION,
			format: "rgba8888",
			topDown: raw.topDown,
			monitors,
		},
		frames,
	};
};

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

const crc32 = (data: Buffer): number => {
	let c = 0xffffffff;
	for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
	const typeBytes = Buffer.from(type, "latin1");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
	return Buffer.concat([length, typeBytes, data, crc]);
};

/**
 * Encodes top-down RGBA8888 as a colour-type-6 PNG. `topDown: false` flips the
 * rows, because HyprCapture's `topDown` flag describes the frame it sent.
 */
export const encodePng = (
	width: number,
	height: number,
	rgba: Buffer,
	topDown = true,
): Buffer => {
	const stride = width * 4;
	if (rgba.length < stride * height) {
		throw new HyprCapturePipeError(
			`cannot encode ${width}x${height} PNG from ${rgba.length} RGBA bytes`,
		);
	}

	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y += 1) {
		const sourceY = topDown ? y : height - 1 - y;
		const target = y * (stride + 1);
		raw[target] = 0;
		rgba.copy(raw, target + 1, sourceY * stride, sourceY * stride + stride);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw)),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
};

/**
 * Composes the per-monitor frames into one image.
 *
 * A single monitor keeps its artifact pixels. Several monitors are drawn on a
 * logical-pixel canvas using their global geometry; a HiDPI monitor is sampled
 * down to its logical size there.
 *
 * ponytail: transform 0 only. Rotated outputs keep the header's transform but
 * their pixel order was not measured, so they are refused rather than guessed.
 */
export const composeFrames = (response: PipeResponse): Image => {
	const { monitors } = response.header;
	if (monitors.length === 1) {
		const monitor = monitors[0]!;
		if (monitor.transform !== 0) {
			throw new HyprCapturePipeError(
				`HyprCapture pipe transform ${monitor.transform} on ${monitor.name} is not supported`,
			);
		}
		return {
			width: monitor.artifactWidth,
			height: monitor.artifactHeight,
			rgba: response.frames[0]!,
			originX: monitor.geometry.x,
			originY: monitor.geometry.y,
			scaleX: monitor.artifactWidth / monitor.geometry.width,
			scaleY: monitor.artifactHeight / monitor.geometry.height,
		};
	}

	for (const monitor of monitors) {
		if (monitor.transform !== 0) {
			throw new HyprCapturePipeError(
				`HyprCapture pipe transform ${monitor.transform} on ${monitor.name} is not supported`,
			);
		}
	}

	const minX = Math.min(...monitors.map((m) => m.geometry.x));
	const minY = Math.min(...monitors.map((m) => m.geometry.y));
	const maxX = Math.max(...monitors.map((m) => m.geometry.x + m.geometry.width));
	const maxY = Math.max(...monitors.map((m) => m.geometry.y + m.geometry.height));
	const width = Math.ceil(maxX - minX);
	const height = Math.ceil(maxY - minY);
	const rgba = Buffer.alloc(width * height * 4);

	monitors.forEach((monitor, index) => {
		const frame = response.frames[index]!;
		const destX = Math.round(monitor.geometry.x - minX);
		const destY = Math.round(monitor.geometry.y - minY);
		const logicalWidth = Math.round(monitor.geometry.width);
		const logicalHeight = Math.round(monitor.geometry.height);
		for (let y = 0; y < logicalHeight; y += 1) {
			const sourceY = Math.min(
				monitor.artifactHeight - 1,
				Math.floor((y * monitor.artifactHeight) / logicalHeight),
			);
			for (let x = 0; x < logicalWidth; x += 1) {
				const sourceX = Math.min(
					monitor.artifactWidth - 1,
					Math.floor((x * monitor.artifactWidth) / logicalWidth),
				);
				const source = (sourceY * monitor.artifactWidth + sourceX) * 4;
				const target = ((destY + y) * width + destX + x) * 4;
				frame.copy(rgba, target, source, source + 4);
			}
		}
	});

	return { width, height, rgba, originX: minX, originY: minY, scaleX: 1, scaleY: 1 };
};

/** `x,y wxh` in global logical coordinates, the shape slurp and Hyprland use. */
export const parseGeometry = (geometry: string): Rect => {
	const match = /^(-?\d+),(-?\d+) (\d+)x(\d+)$/.exec(geometry.trim());
	if (!match) throw new HyprCapturePipeError(`not a capture geometry: ${geometry}`);
	return {
		x: Number(match[1]),
		y: Number(match[2]),
		width: Number(match[3]),
		height: Number(match[4]),
	};
};

export const cropImage = (image: Image, rect: Rect): Image => {
	const left = Math.round((rect.x - image.originX) * image.scaleX);
	const top = Math.round((rect.y - image.originY) * image.scaleY);
	const width = Math.round(rect.width * image.scaleX);
	const height = Math.round(rect.height * image.scaleY);
	const x0 = Math.max(0, Math.min(image.width, left));
	const y0 = Math.max(0, Math.min(image.height, top));
	const x1 = Math.max(x0, Math.min(image.width, left + width));
	const y1 = Math.max(y0, Math.min(image.height, top + height));
	const outWidth = x1 - x0;
	const outHeight = y1 - y0;
	if (outWidth <= 0 || outHeight <= 0) {
		throw new HyprCapturePipeError(
			`capture region ${rect.x},${rect.y} ${rect.width}x${rect.height} is outside the screen`,
		);
	}

	const rgba = Buffer.alloc(outWidth * outHeight * 4);
	for (let y = 0; y < outHeight; y += 1) {
		const source = ((y0 + y) * image.width + x0) * 4;
		image.rgba.copy(rgba, y * outWidth * 4, source, source + outWidth * 4);
	}
	return {
		width: outWidth,
		height: outHeight,
		rgba,
		originX: image.originX + x0 / image.scaleX,
		originY: image.originY + y0 / image.scaleY,
		scaleX: image.scaleX,
		scaleY: image.scaleY,
	};
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const isWouldBlock = (error: unknown): boolean => {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "EAGAIN" || code === "EWOULDBLOCK";
};

const readWithTimeout = async (fd: number, timeoutMs: number): Promise<Buffer> => {
	const deadline = Date.now() + timeoutMs;
	const chunks: Buffer[] = [];
	let total = 0;
	let expected: number | null = null;

	while (Date.now() < deadline) {
		const chunk = Buffer.allocUnsafe(READ_CHUNK);
		let read = 0;
		try {
			read = readSync(fd, chunk, 0, chunk.length, null);
		} catch (error) {
			if (isWouldBlock(error)) {
				await sleep(10);
				continue;
			}
			throw error;
		}
		if (read === 0) {
			await sleep(10);
			continue;
		}

		chunks.push(chunk.subarray(0, read));
		total += read;
		const data = Buffer.concat(chunks, total);
		if (expected === null) expected = declaredLength(data);
		if (expected !== null && total >= expected) {
			return data;
		}
	}

	throw new HyprCapturePipeError(
		`HyprCapture export pipe did not answer within ${timeoutMs} ms`,
	);
};

const assertPrivateDirectory = (path: string, uid: number): void => {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true, mode: 0o700 });
	}
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new HyprCapturePipeError(`${path} is not a private directory`);
	}
	if (stat.uid !== uid) {
		throw new HyprCapturePipeError(`${path} belongs to uid ${stat.uid}, not ${uid}`);
	}
	if ((stat.mode & 0o077) !== 0) chmodSync(path, 0o700);
};

const makeFifo = (path: string): void => {
	execFileSync("mkfifo", ["-m", "600", path], { stdio: "ignore" });
	const stat = statSync(path);
	if ((stat.mode & 0o777) !== 0o600) {
		throw new HyprCapturePipeError(`could not create a private FIFO at ${path}`);
	}
};

/** Only a generated path is ever interpolated into Lua; a quote cannot get in. */
export const exportPipeCommand = (requestFifo: string): string => {
	if (!/^[A-Za-z0-9/_.-]+$/.test(requestFifo)) {
		throw new HyprCapturePipeError(`refusing a request path with unsafe characters: ${requestFifo}`);
	}
	return `hl.plugin.hyprcapture.export_pipe('${requestFifo}')`;
};

const runHyprctl = (lua: string): void => {
	try {
		execFileSync("hyprctl", ["eval", lua], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 5000,
		});
	} catch (error) {
		// `hyprctl eval` reports a Lua error on stdout and exits non-zero; stderr
		// only carries a bad invocation. Reading stderr alone turns "session
		// locked" into a bare "Command failed".
		const failure = error as { stdout?: Buffer | string; stderr?: Buffer | string };
		const message = `${String(failure.stderr ?? "")}\n${String(failure.stdout ?? "")}`
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.pop();
		throw new HyprCapturePipeError(
			`hyprctl eval failed: ${message || (error as Error).message}`,
		);
	}
};

export type CapturePipeOptions = {
	timeoutMs?: number;
	/** Test seam: a fake compositor can answer without Hyprland. */
	runCompositor?: (lua: string) => void;
};

/**
 * Takes one fullscreen/all-monitors frame. The client directory and both FIFOs
 * live only for this call, including every failure path.
 */
export const capturePipe = async (
	options: CapturePipeOptions = {},
): Promise<PipeResponse> => {
	const uid = typeof process.getuid === "function" ? process.getuid() : 0;
	const root = `/dev/shm/hyprcapture-${uid}`;
	assertPrivateDirectory(root, uid);

	const client = mkdtempSync(join(root, "iskra-"));
	chmodSync(client, 0o700);
	const requestFifo = join(client, "request.fifo");
	const responseFifo = join(client, "response.fifo");
	let requestFd: number | null = null;
	let responseFd: number | null = null;

	try {
		makeFifo(requestFifo);
		makeFifo(responseFifo);
		// Read-write keeps the open from blocking before the plugin has opened its
		// end; the declared byte count, not EOF, is what ends the read.
		requestFd = openSync(
			requestFifo,
			constants.O_RDWR | constants.O_NONBLOCK,
		);
		responseFd = openSync(
			responseFifo,
			constants.O_RDWR | constants.O_NONBLOCK,
		);
		writeSync(
			requestFd,
			`${JSON.stringify({
				version: PROTOCOL_VERSION,
				responseFifo,
				mode: "fullscreen",
				fullscreenScope: "all",
			})}\n`,
		);
		(options.runCompositor ?? runHyprctl)(exportPipeCommand(requestFifo));
		const data = await readWithTimeout(responseFd, options.timeoutMs ?? READ_TIMEOUT_MS);
		return parsePipeResponse(data);
	} finally {
		if (requestFd !== null) closeSync(requestFd);
		if (responseFd !== null) closeSync(responseFd);
		rmSync(client, { recursive: true, force: true });
	}
};
