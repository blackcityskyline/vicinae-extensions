import assert from "node:assert/strict";

import {
  maskSecrets,
  mergeHistories,
  parseBash,
  parseFish,
  parseZsh,
} from "../src/utils/history.ts";

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
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

// ---------------------------------------------------------------------------
// Parsing. Every fixture below is a verbatim excerpt of a real history file on
// this machine, except that any value that looked like a credential was
// replaced with an obviously fake one.
// ---------------------------------------------------------------------------

check("bash keeps one command per line and drops nothing", () => {
  const history = parseBash("cd ~/dev\nls -la\nnpm run build");
  assert.deepEqual(history.map((entry) => entry.command), ["cd ~/dev", "ls -la", "npm run build"]);
});

check("bash keeps comments that are part of a pasted snippet", () => {
  const history = parseBash("# извлекаем только заголовки\nmpv --no-config");
  assert.equal(history[0]?.command, "# извлекаем только заголовки");
});

// bash writes `#<epoch>` before a command when HISTTIMEFORMAT is set. Those are
// metadata, not commands: showing them would put "#1740000000" in a search list.

check("bash timestamp lines are used as metadata, never listed as commands", () => {
  const history = parseBash("#1740000000\nls -la\n#1740000060\npwd");
  assert.deepEqual(history.map((entry) => entry.command), ["ls -la", "pwd"]);
  assert.equal(history[0]?.when, 1740000000 * 1000);
  assert.equal(history[1]?.when, 1740000060 * 1000);
});

check("a bash file with no timestamps yields no times rather than junk", () => {
  const history = parseBash("ls\npwd");
  assert.deepEqual(history.map((entry) => entry.when), [undefined, undefined]);
});

check("zsh reads the extended format with its duration", () => {
  const history = parseZsh(": 1740000000:0;ls -la\n: 1740000060:5;pwd");
  assert.deepEqual(history.map((entry) => entry.command), ["ls -la", "pwd"]);
  assert.equal(history[0]?.when, 1740000000 * 1000);
  assert.equal(history[1]?.when, 1740000060 * 1000);
});

check("zsh joins a multi-line command back together", () => {
  // A for loop in zsh history is written with a trailing backslash.
  const history = parseZsh(': 1740000000:0;for f in *; do \\\n  echo "$f" \\\ndone');
  assert.equal(history.length, 1);
  assert.equal(history[0]?.command, 'for f in *; do\n  echo "$f"\ndone');
});

check("zsh falls back to plain lines when there is no extended format", () => {
  const history = parseZsh("ls -la\npwd");
  assert.deepEqual(history.map((entry) => entry.command), ["ls -la", "pwd"]);
  assert.deepEqual(history.map((entry) => entry.when), [undefined, undefined]);
});

check("fish reads the - cmd: / when: pairs", () => {
  const history = parseFish("- cmd: paru waterfox\n  when: 1766115222\n- cmd: sudo pacman -S x11\n  when: 1766116455");
  assert.deepEqual(history.map((entry) => entry.command), ["paru waterfox", "sudo pacman -S x11"]);
  assert.equal(history[0]?.when, 1766115222 * 1000);
});

// fish escapes a newline inside one command as a literal backslash-n, because
// each entry has to stay on one line of the file.

check("fish unescapes the newline it encodes as \\n", () => {
  const history = parseFish('- cmd: sudo pacman -S --needed git\\ngit clone https://example/yay.git');
  assert.equal(history[0]?.command, "sudo pacman -S --needed git\ngit clone https://example/yay.git");
  assert.equal(history.length, 1);
});

// fish writes a bare `- cmd:` with no `when:` to start a session. Dropping every
// entry that has no timestamp — which is what a naive parse does — loses the
// command outright.

check("a fish entry without a timestamp is kept, without a time", () => {
  const history = parseFish("- cmd: \n- cmd: ls");
  assert.deepEqual(history.map((entry) => entry.command), ["ls"]);
  assert.deepEqual(history.map((entry) => entry.when), [undefined]);
});

check("merge puts the newest first across shells", () => {
  const merged = mergeHistories([
    parseBash("old"),
    parseFish("- cmd: newest\n  when: 1766115222"),
    parseZsh(": 1740000000:0;middle"),
  ]);
  assert.deepEqual(merged.map((entry) => entry.command), ["newest", "middle", "old"]);
  assert.deepEqual(merged.map((entry) => entry.shell), ["fish", "zsh", "bash"]);
});

// ---------------------------------------------------------------------------
// maskSecrets. The list is on screen while people screen-share and record
// demos, so the value that is displayed is masked. The command that Copy hands
// over is not.
// ---------------------------------------------------------------------------

check("a token-shaped literal is masked wherever it appears", () => {
  assert.equal(maskSecrets("git clone https://x:y@github.com/o/r"), "git clone https://x:y@github.com/o/r");
  assert.equal(maskSecrets("gh push ghp_AAAABBBBCCCCDDDDEEEEFFFF"), "gh push ***");
  assert.equal(maskSecrets("use ghp_AAAABBBBCCCCDDDDEEEEFFFF now"), "use *** now");
  assert.equal(maskSecrets("glpat-AAAABBBBCCCCDDDDEEEE"), "***");
  assert.equal(maskSecrets("xoxb-123456789012-abcdefghijkl"), "***");
});

check("a credential in an assignment is masked and the name is kept", () => {
  assert.equal(maskSecrets("export GITHUB_TOKEN=ghp_AAAABBBBCCCCDDDD"), "export GITHUB_TOKEN=***");
  assert.equal(maskSecrets("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7"), "AWS_SECRET_ACCESS_KEY=***");
  assert.equal(maskSecrets("DB_PASSWORD=hunter2"), "DB_PASSWORD=***");
  assert.equal(maskSecrets("MY_API_KEY=abc123"), "MY_API_KEY=***");
});

check("a quoted assignment keeps its quoting intact", () => {
  assert.equal(maskSecrets('export TOKEN="ghp_AAAABBBBCCCCDDDD"'), "export TOKEN=***");
});

check("a long option with a value is masked", () => {
  assert.equal(maskSecrets("mysql --password=hunter2 db"), "mysql --password=*** db");
  assert.equal(maskSecrets("mysql --password hunter2 db"), "mysql --password *** db");
  assert.equal(maskSecrets("curl --api-key abc123 https://x"), "curl --api-key *** https://x");
});

check("an Authorization header is masked whatever scheme it uses", () => {
  assert.equal(maskSecrets("curl -H 'Authorization: Bearer abc123' https://api"), "curl -H 'Authorization: ***' https://api");
  assert.equal(maskSecrets("curl -H 'Authorization: Basic dXNlcjpwYXNz' https://api"), "curl -H 'Authorization: ***' https://api");
  // An allow-list of schemes read straight past OAuth and left the token on screen.
  assert.equal(maskSecrets('curl -H "Authorization: OAuth xlwb3kb2acwpct0" https://api'), 'curl -H "Authorization: ***" https://api');
  assert.equal(maskSecrets("curl -H 'Authorization: token=ghp_AAAABBBBCCCCDDDD' https://api"), "curl -H 'Authorization: ***' https://api");
});

check("the attached short password flag is masked for the shells that take one", () => {
  assert.equal(maskSecrets("mysql -phunter2 -u root"), "mysql -*** -u root");
  assert.equal(maskSecrets("mariadb -phunter2 -u root"), "mariadb -*** -u root");
});

// -p with a space is left alone on purpose: `-p 8080` and `-p 8080` are
// indistinguishable, and hiding every port in a history would be useless.

check("long options that merely start with -p are left alone", () => {
  // Masking these would make every ffmpeg line in the history unreadable.
  assert.equal(maskSecrets("ffmpeg -f x11grab -pix_fmt yuv420p -preset slow in.mkv"), "ffmpeg -f x11grab -pix_fmt yuv420p -preset slow in.mkv");
  assert.equal(maskSecrets("ffmpeg -profile:v high -pass 1 out.mp4"), "ffmpeg -profile:v high -pass 1 out.mp4");
  assert.equal(maskSecrets("ssh -p 2222 host"), "ssh -p 2222 host");
  assert.equal(maskSecrets("nc -lp 8080"), "nc -lp 8080");
});

check("ordinary commands are not touched", () => {
  const plain = [
    "cd ~/dev/me/vicinae-extensions && npm run build",
    "git commit -am 'fix the parser'",
    "pacman -Syu --needed base-devel",
    "grep -rn --include='*.ts' -E 'foo|bar' src/",
    "KEYBOARD=1 lsp 2>/dev/null || true",
    // A Python line that computes a header, not a header holding a credential.
    'authorization = f"SAPISIDHASH {ts}_{h}"',
    "sed -i 's/a/b/g' file.txt",
  ];
  for (const command of plain) assert.equal(maskSecrets(command), command, command);
});

// Two lines out of 6361 on this machine look like this. Nothing is hidden that
// was not already a placeholder, and the alternative is guessing that a line
// containing "authorization" holds no credential.
check("a config line that builds a header is masked even though it holds no secret", () => {
  assert.equal(maskSecrets('"authorization": authorization,'), '"authorization": ***');
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
