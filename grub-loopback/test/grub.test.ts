import assert from "node:assert/strict";
import { buildGrubEntry, buildInstallScript, escapeGrubString } from "../src/lib/grub.ts";

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

check("escapeGrubString escapes quotes", () => {
  assert.equal(escapeGrubString('a"b\\c'), 'a\\"b\\\\c');
});

check("auto entry contains iso path and configfile", () => {
  const entry = buildGrubEntry({ isoPath: "/isos/ubuntu.iso", title: "Ubuntu", distro: "auto" });
  assert.match(entry, /menuentry "Ubuntu"/);
  assert.match(entry, /set iso_path="\/isos\/ubuntu\.iso"/);
  assert.match(entry, /configfile \(loop\)\/boot\/grub\/grub\.cfg/);
});

check("ubuntu entry uses casper", () => {
  const entry = buildGrubEntry({ isoPath: "/isos/x.iso", title: "X", distro: "ubuntu" });
  assert.match(entry, /casper\/vmlinuz/);
});

check("install script includes managed markers and update-grub", () => {
  const entry = buildGrubEntry({ isoPath: "/isos/x.iso", title: "X", distro: "auto" });
  const script = buildInstallScript({ entry, reboot: false });
  assert.match(script, /# BEGIN grub-loopback/);
  assert.match(script, /update-grub/);
  assert.match(script, /Reboot manually/);
});

check("install script reboots when requested", () => {
  const entry = buildGrubEntry({ isoPath: "/isos/x.iso", title: "X", distro: "auto" });
  const script = buildInstallScript({ entry, reboot: true });
  assert.match(script, /systemctl reboot/);
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
