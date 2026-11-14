# ISO Toolkit

Boot, write and format ISO images from the launcher.

| Command | Does |
| --- | --- |
| Boot ISO (GRUB Loopback) | adds a menu entry to `/etc/grub.d/40_custom` and regenerates the GRUB config |
| Boot ISO (kexec) | loads the ISO's kernel and initrd and boots them in place of the running system |
| Write ISO to USB | `dd` an ISO onto a drive |
| Format USB drive | format a drive with a chosen filesystem |
| Eject USB drive | unmount and eject |
| List block devices | sizes, models, mount points |
| Recent ISOs and devices | what was used last |

## How the boot commands find the ISO

GRUB and the initramfs address the ISO by filesystem UUID and by the path
*inside* that filesystem, which is not the path you see: with `/home` on the
btrfs subvolume `@home`, `/home/me/x.iso` is `/@home/me/x.iso` to GRUB. Both
commands read the mount's root from `/proc/self/mountinfo`, so subvolumes and
bind mounts are covered, and on btrfs the default-subvolume prefix is dropped
because GRUB mounts the default subvolume as `/`. `/` and `/home` may be
different partitions; ext4, btrfs, xfs and vfat work the same way.

An ISO inside a subvolume that is not under the default one cannot be reached by
either command, which says so instead of writing an entry that cannot boot. A
LUKS or LVM volume works only if GRUB and the initramfs can open it, and the
command warns when the ISO is on one.

The GRUB command keeps one managed block in `40_custom`: a second ISO replaces
the first. Paths with a quote, backslash, `$` or backtick are refused.

## kexec and the display

`systemctl kexec` stops services and runs the drivers' shutdown hooks first; a
bare `kexec -e` skips them and can leave the GPU in a state the next kernel does
not recover from. `nomodeset` is off by default, since it stops the new kernel's
native driver from lighting the panel; the **Add nomodeset** checkbox is for a
screen that stays dark with it.

The kernel loads with `kexec -s`, falling back to `kexec -l`. The ISO must ship
`boot/grub/loopback.cfg`, whose first menu entry is used.

## Requirements

`bsdtar` (libarchive), `kexec-tools`, `blkid` and `sudo`; `btrfs-progs` for btrfs.

`assets/extension_icon.png` is a neutral placeholder: replace it with a 512×512
icon before shipping and update the manifest's `icon` if the file is renamed.

## Not verified

The GRUB and kexec boot paths were not exercised: both reboot the machine.
Command construction is covered by the self-checks.
