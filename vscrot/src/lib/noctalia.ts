import { run } from "../backends/utils";

// The binary being on PATH says nothing about a shell to talk to: with Noctalia
// stopped, `msg` is the only thing that answers, and it answers with an error.
// One probe per worker process — a command lives for seconds, and every
// availability question in it has the same answer.
let shellAnswers: boolean | null = null;

export const noctaliaAnswers = (): boolean => {
	if (shellAnswers === null) {
		try {
			run("noctalia", ["msg", "color-scheme-get"]);
			shellAnswers = true;
		} catch {
			shellAnswers = false;
		}
	}
	return shellAnswers;
};

// Older shells (v5.3.0 among them) accept no per-call options: the whole rest of
// the line is read as a monitor selector, so `--directory` becomes an "unknown
// monitor selector" error and the capture never happens. The help text lists a
// command's own flags, which is the only capability signal the IPC exposes.
// Newer shells declare the screenshot options and list them there.
let captureSupport: boolean | null = null;

export const noctaliaCaptureSupported = (): boolean => {
	if (captureSupport === null) {
		try {
			captureSupport = run("noctalia", [
				"msg",
				"screenshot-fullscreen",
				"--help",
			]).includes("--directory");
		} catch {
			captureSupport = false;
		}
	}
	return captureSupport;
};
