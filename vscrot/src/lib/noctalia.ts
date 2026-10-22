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
