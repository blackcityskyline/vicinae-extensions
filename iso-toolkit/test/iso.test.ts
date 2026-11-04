import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInstallScript, sanitizeTitle } from "../src/lib/grub.ts";
import { buildKexecScript } from "../src/lib/kexec.ts";

const WORK = mkdtempSync(join(tmpdir(), "iso-toolkit-"));
const REAL_BLKID = spawnSync("bash", ["-c", "command -v blkid"], { encoding: "utf8" }).stdout.trim();
const UUID = "a79a8139-dd62-40d9-bd57-dfb00ffb9417";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  assert.equal(r.status, 0, `${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** Fake root-only tools, so the generated scripts run unprivileged. */
const BIN = join(WORK, "bin");
mkdirSync(BIN);
function tool(name: string, body: string) {
  writeFileSync(join(BIN, name), `#!/bin/bash\n${body}\n`);
  chmodSync(join(BIN, name), 0o755);
}
tool("sudo", 'exec "$@"');
tool("blkid", `case "$*" in *LABEL*) exec ${REAL_BLKID} "$@";; esac\necho "$FAKE_UUID"`);
tool("btrfs", 'echo "$FAKE_DEFAULT_SUBVOL"');
tool("update-grub", 'echo called >> "$LOG_DIR/update-grub"');
tool("systemctl", 'echo "$@" >> "$LOG_DIR/systemctl"');
tool(
  "kexec",
  `echo "$@" >> "$LOG_DIR/kexec"
case "$1" in -s) [ -n "\${FAKE_KEXEC_S_FAILS:-}" ] && exit 1;; esac
for a in "$@"; do case "$a" in --initrd=*) cp "\${a#--initrd=}" "$LOG_DIR/initrd";; esac; done`,
);

type Layout = {
  /** mountinfo root of the filesystem holding the ISO */
  root: string;
  fstype: string;
  /** what `btrfs subvolume get-default` prints */
  defaultSubvol?: string;
  /** directory under the mount point */
  dir?: string;
  /** an older mount of another filesystem at the same mount point, listed first */
  shadowed?: boolean;
};

let counter = 0;
/** A mount point in the sandbox plus a mountinfo that describes it. */
function mount(layout: Layout, isoName: string, isoSource: string) {
  const id = String(++counter);
  const mp = join(WORK, `mnt ${id}`);
  const dir = join(mp, layout.dir ?? "me");
  mkdirSync(dir, { recursive: true });
  const iso = join(dir, isoName);
  run("cp", [isoSource, iso]);
  const esc = (s: string) => s.replace(/ /g, "\\040");
  const info = join(WORK, `mountinfo-${id}`);
  writeFileSync(
    info,
    [
      "25 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw",
      ...(layout.shadowed ? [`98 25 8:9 /old ${esc(mp)} rw,relatime - vfat /dev/sdz9 rw`] : []),
      `99 25 0:42 ${esc(layout.root)} ${esc(mp)} rw,relatime shared:2 - ${layout.fstype} /dev/nvme0n1p3 rw`,
      "",
    ].join("\n"),
  );
  const logDir = join(WORK, `log-${id}`);
  mkdirSync(logDir);
  const env = {
    PATH: `${BIN}:${process.env.PATH}`,
    FAKE_UUID: UUID,
    FAKE_DEFAULT_SUBVOL: layout.defaultSubvol ?? "ID 5 (FS_TREE)",
    LOG_DIR: logDir,
  };
  return { iso, info, logDir, env };
}

function build(files: Record<string, string>, label: string, name: string): string {
  const dir = join(WORK, `tree-${name}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const out = join(WORK, `${name}.iso`);
  run("xorriso", ["-as", "mkisofs", "-quiet", "-V", label, "-o", out, dir]);
  return out;
}

const ARCH_CFG = `# Load partition table and file system modules
insmod part_gpt
insmod iso9660

menuentry "Arch Linux install medium (x86_64, UEFI)" --class arch --id 'archiso-x86_64-linux' {
    set gfxpayload=keep
    search --no-floppy --set=root --label ARCHISO_202611
    linux /arch/boot/x86_64/vmlinuz-linux archisobasedir=arch img_dev=UUID=\${archiso_img_dev_uuid} img_loop="\${iso_path}"
    initrd /arch/boot/intel-ucode.img /arch/boot/amd-ucode.img /arch/boot/x86_64/initramfs-linux.img
}

menuentry "Second entry" {
    linux /second
    initrd /second.img
}
`;
const ARCH_ISO = build(
  {
    "boot/grub/loopback.cfg": ARCH_CFG,
    "arch/boot/x86_64/vmlinuz-linux": "KERNEL",
    "arch/boot/intel-ucode.img": "INTEL|",
    "arch/boot/amd-ucode.img": "AMD|",
    "arch/boot/x86_64/initramfs-linux.img": "INITRAMFS",
  },
  "ARCHISO_202611",
  "arch",
);
const UBUNTU_ISO = build(
  {
    "boot/grub/loopback.cfg": "menuentry \"Try Ubuntu\" {\n  linux /casper/vmlinuz iso-scan/filename=${iso_path} quiet splash ---\n  initrd /casper/initrd\n}\n",
    "casper/vmlinuz": "K",
    "casper/initrd": "I",
  },
  "Ubuntu 26.04 amd64",
  "ubuntu",
);
const FEDORA_ISO = build(
  { "images/pxeboot/vmlinuz": "K", "images/pxeboot/initrd.img": "I" },
  "Fedora-WS-Live-44",
  "fedora",
);

function install(
  m: ReturnType<typeof mount>,
  opts: { distro?: "auto" | "ubuntu" | "fedora"; reboot?: boolean; title?: string } = {},
) {
  const custom = join(m.logDir, "40_custom");
  const script = buildInstallScript({ distro: opts.distro ?? "auto", reboot: opts.reboot ?? false })
    .split("/proc/self/mountinfo").join(m.info)
    .split("/etc/grub.d/40_custom").join(custom);
  const r = spawnSync("bash", ["-c", script, "grub-loopback", m.iso, opts.title ?? "Test ISO"], {
    env: m.env,
    encoding: "utf8",
  });
  return { ...r, custom, text: existsSync(custom) ? readFileSync(custom, "utf8") : "" };
}

function kexec(m: ReturnType<typeof mount>, extra: string[] = [], env: Record<string, string> = {}) {
  const script = buildKexecScript().split("/proc/self/mountinfo").join(m.info);
  const path = join(m.logDir, "kexec.sh");
  writeFileSync(path, script);
  const r = spawnSync("bash", [path, m.iso, ...extra], {
    env: { ...m.env, ...env },
    input: "\n",
    encoding: "utf8",
  });
  const log = (n: string) => (existsSync(join(m.logDir, n)) ? readFileSync(join(m.logDir, n), "utf8") : "");
  return { ...r, kexecLog: log("kexec"), systemctlLog: log("systemctl"), initrd: log("initrd") };
}

function grubSyntax(text: string) {
  const f = join(WORK, `syntax-${++counter}.cfg`);
  writeFileSync(f, text);
  const r = spawnSync("grub-script-check", [f], { encoding: "utf8" });
  assert.equal(r.status, 0, `grub-script-check: ${r.stderr}`);
}

// ---- GRUB: where the ISO is, as GRUB sees it -----------------------------

check("btrfs subvolume: the entry uses the in-filesystem path, not the path under /home", () => {
  const m = mount({ root: "/@home", fstype: "btrfs" }, "arch.iso", ARCH_ISO);
  const r = install(m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.text, /set iso_path="\/@home\/me\/arch\.iso"/);
  assert.match(r.text, new RegExp(`search --no-floppy --fs-uuid --set=root ${UUID}`));
  assert.match(r.text, /insmod btrfs/);
});

check("btrfs whose default subvolume is the one holding the ISO: that prefix is dropped", () => {
  const m = mount({ root: "/@home", fstype: "btrfs", defaultSubvol: "ID 256 gen 8 top level 5 path @home" }, "arch.iso", ARCH_ISO);
  const r = install(m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.text, /set iso_path="\/me\/arch\.iso"/);
});

check("btrfs whose default subvolume does not hold the ISO: refuses instead of writing a dead entry", () => {
  const m = mount({ root: "/@home", fstype: "btrfs", defaultSubvol: "ID 257 gen 8 top level 5 path @" }, "arch.iso", ARCH_ISO);
  const r = install(m);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /outside the default btrfs subvolume/);
  assert.equal(r.text, "");
});

check("btrfs top-level mount: the path is unchanged", () => {
  const m = mount({ root: "/", fstype: "btrfs" }, "arch.iso", ARCH_ISO);
  assert.match(install(m).text, /set iso_path="\/me\/arch\.iso"/);
});

check("ext4: ext2 module, plain path", () => {
  const m = mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO);
  const r = install(m);
  assert.match(r.text, /insmod ext2/);
  assert.doesNotMatch(r.text, /insmod ext4/);
  assert.match(r.text, /set iso_path="\/me\/arch\.iso"/);
});

check("xfs gets its own module", () => {
  const m = mount({ root: "/", fstype: "xfs" }, "arch.iso", ARCH_ISO);
  assert.match(install(m).text, /insmod xfs/);
});

check("a later mount over the same mount point wins", () => {
  const m = mount({ root: "/@home", fstype: "btrfs", shadowed: true }, "arch.iso", ARCH_ISO);
  const t = install(m).text;
  assert.match(t, /set iso_path="\/@home\/me\/arch\.iso"/);
  assert.match(t, /insmod btrfs/);
});

check("bind mount: the source directory is part of the path", () => {
  const m = mount({ root: "/srv/data", fstype: "ext4" }, "arch.iso", ARCH_ISO);
  assert.match(install(m).text, /set iso_path="\/srv\/data\/me\/arch\.iso"/);
});

check("spaces in the mount point and the file name survive the octal escapes", () => {
  const m = mount({ root: "/@home", fstype: "btrfs", dir: "My ISOs" }, "a b.iso", ARCH_ISO);
  const r = install(m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.text, /set iso_path="\/@home\/My ISOs\/a b\.iso"/);
  grubSyntax(r.text);
});

check("a path with a quote, dollar or backslash is refused", () => {
  for (const name of ['q"x.iso', "d$x.iso", "b\\x.iso"]) {
    const m = mount({ root: "/", fstype: "ext4" }, name, ARCH_ISO);
    const r = install(m);
    assert.notEqual(r.status, 0, name);
    assert.equal(r.text, "", name);
  }
});

// ---- GRUB: the entry itself ----------------------------------------------

check("auto entry follows the loopback.cfg convention", () => {
  const m = mount({ root: "/@home", fstype: "btrfs" }, "arch.iso", ARCH_ISO);
  const t = install(m).text;
  const order = ["insmod loopback", 'set iso_path=', "export iso_path", "search --no-floppy --fs-uuid", 'loopback loop "$iso_path"', "set root=(loop)", "configfile /boot/grub/loopback.cfg"];
  let at = -1;
  for (const part of order) {
    const i = t.indexOf(part, at + 1);
    assert.ok(i > at, `${part} missing or out of order`);
    at = i;
  }
});

check("every template passes grub-script-check and keeps GRUB variables literal", () => {
  const cases: ["auto" | "ubuntu" | "fedora", string][] = [
    ["auto", ARCH_ISO],
    ["ubuntu", UBUNTU_ISO],
    ["fedora", FEDORA_ISO],
  ];
  for (const [distro, iso] of cases) {
    const m = mount({ root: "/@home", fstype: "btrfs" }, "x.iso", iso);
    const r = install(m, { distro });
    assert.equal(r.status, 0, `${distro}: ${r.stderr}`);
    grubSyntax(r.text);
    assert.match(r.text, /loopback loop "\$iso_path"/, distro);
  }
});

check("ubuntu entry boots casper with iso-scan", () => {
  const m = mount({ root: "/", fstype: "ext4" }, "u.iso", UBUNTU_ISO);
  const t = install(m, { distro: "ubuntu" }).text;
  assert.match(t, /linux \(loop\)\/casper\/vmlinuz boot=casper iso-scan\/filename="\$iso_path"/);
});

check("fedora entry takes the volume label from the ISO, not a hardcoded one", () => {
  const m = mount({ root: "/", fstype: "ext4" }, "f.iso", FEDORA_ISO);
  const t = install(m, { distro: "fedora" }).text;
  assert.match(t, /root=live:CDLABEL=Fedora-WS-Live-44 /);
  assert.match(t, /\(loop\)\/images\/pxeboot\/vmlinuz/);
});

check("a template that does not match the ISO is refused", () => {
  const m = mount({ root: "/", fstype: "ext4" }, "a.iso", ARCH_ISO);
  const r = install(m, { distro: "ubuntu" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no casper\/vmlinuz/);
});

check("the title is stripped of characters that would break the GRUB string", () => {
  assert.equal(sanitizeTitle('My "ISO" $x \\ `y`\n'), "My ISO x  y");
  const m = mount({ root: "/", fstype: "ext4" }, "a.iso", ARCH_ISO);
  const r = install(m, { title: sanitizeTitle('He said "hi" $HOME') });
  grubSyntax(r.text);
  assert.match(r.text, /menuentry "He said hi HOME"/);
});

// ---- GRUB: installing -----------------------------------------------------

check("installing twice leaves one managed block and runs update-grub each time", () => {
  const m = mount({ root: "/", fstype: "ext4" }, "a.iso", ARCH_ISO);
  install(m);
  const r = install(m);
  assert.equal(r.text.match(/# BEGIN grub-loopback/g)?.length, 1);
  assert.equal(r.text.match(/# END grub-loopback/g)?.length, 1);
  assert.equal(readFileSync(join(m.logDir, "update-grub"), "utf8").trim().split("\n").length, 2);
});

check("reboot only when asked", () => {
  const a = mount({ root: "/", fstype: "ext4" }, "a.iso", ARCH_ISO);
  install(a, { reboot: false });
  assert.equal(existsSync(join(a.logDir, "systemctl")), false);
  const b = mount({ root: "/", fstype: "ext4" }, "a.iso", ARCH_ISO);
  install(b, { reboot: true });
  assert.equal(readFileSync(join(b.logDir, "systemctl"), "utf8").trim(), "reboot");
});

// ---- kexec ----------------------------------------------------------------

check("kexec passes archiso the device UUID and the in-filesystem path", () => {
  const m = mount({ root: "/@home", fstype: "btrfs" }, "arch.iso", ARCH_ISO);
  const r = kexec(m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.kexecLog, new RegExp(`img_dev=UUID=${UUID}`));
  assert.match(r.kexecLog, /img_loop=\/@home\/me\/arch\.iso/);
  assert.doesNotMatch(r.kexecLog, /"/);
});

check("kexec concatenates every initrd, in order", () => {
  const r = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO));
  assert.equal(r.initrd, "INTEL|AMD|INITRAMFS");
});

check("kexec reads the first menuentry only", () => {
  const r = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO));
  assert.doesNotMatch(r.kexecLog, /second/);
});

check("kexec leaves the display alone by default and adds nomodeset on request", () => {
  const off = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO));
  assert.doesNotMatch(off.kexecLog, /nomodeset/);
  const on = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO), ["nomodeset"]);
  assert.match(on.kexecLog, /nomodeset/);
});

check("kexec uses kexec_file_load first and falls back to kexec_load", () => {
  const ok = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO));
  assert.match(ok.kexecLog.split("\n")[0] ?? "", /^-s -l /);
  const fb = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO), [], { FAKE_KEXEC_S_FAILS: "1" });
  assert.equal(fb.status, 0, fb.stderr);
  const lines = fb.kexecLog.trim().split("\n");
  assert.match(lines[0] ?? "", /^-s -l /);
  assert.match(lines[1] ?? "", /^-l /);
});

check("kexec boots through systemctl, never a bare kexec -e", () => {
  const r = kexec(mount({ root: "/", fstype: "ext4" }, "arch.iso", ARCH_ISO));
  assert.equal(r.systemctlLog.trim(), "kexec");
  assert.doesNotMatch(r.kexecLog, /(^| )-e( |$)/m);
});

check("kexec works for a casper ISO whose loopback.cfg uses the unbraced form", () => {
  const r = kexec(mount({ root: "/", fstype: "ext4" }, "u.iso", UBUNTU_ISO));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.kexecLog, /iso-scan\/filename=\/me\/u\.iso/);
});

check("kexec stops with a message when the ISO has no loopback.cfg", () => {
  const r = kexec(mount({ root: "/", fstype: "ext4" }, "f.iso", FEDORA_ISO));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No boot\/grub\/loopback\.cfg/);
  assert.equal(r.kexecLog, "");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
