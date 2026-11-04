# ISO Toolkit

Boot, write and format ISO images from the launcher.

## Commands

| Command | Does |
| --- | --- |
| Boot ISO (GRUB Loopback) | Adds a menu entry to `/etc/grub.d/40_custom` and regenerates the GRUB config. Reboot, pick the entry. |
| Boot ISO (kexec) | Loads the ISO's kernel and initrd with kexec and boots them in place of the running system, no reboot through the firmware. |
| Write ISO to USB | `dd` an ISO onto a drive. |
| Format USB drive | Format a drive with a chosen filesystem. |
| Eject USB drive | Unmount and eject. |
| List block devices | Sizes, models, mount points. |
| Recent ISOs and devices | Recently used ISOs and drives. |

## How the two boot commands find the ISO

GRUB and the initramfs address the ISO by filesystem UUID and by the path *inside*
that filesystem, which is not the path you see. With `/home` mounted from the btrfs
subvolume `@home`, `/home/me/x.iso` is `/@home/me/x.iso` to GRUB. Both commands read the
mount's root from `/proc/self/mountinfo`, so subvolumes and bind mounts are covered, and
on btrfs they drop the default-subvolume prefix, because GRUB and the initramfs mount the
default subvolume as `/`. `/` and `/home` may be different partitions; ext4, btrfs, xfs,
vfat and friends work the same way.

An ISO inside a subvolume that is not under the default one cannot be reached by either,
and the commands say so instead of writing an entry that cannot boot. A LUKS or LVM volume
only works if GRUB and the initramfs can open it; the commands warn when the ISO is on one.

The GRUB command keeps one managed block in `40_custom`: installing a second ISO replaces
the first. Paths with a quote, backslash, `$` or backtick are refused.

## kexec and the display

The command ends with `systemctl kexec`, which stops services and runs the drivers'
shutdown hooks first; a bare `kexec -e` skips them and can leave the GPU in a state the next
kernel does not recover from. `nomodeset` is off by default, since it stops the new
kernel's native driver from lighting the panel. The *Add nomodeset* checkbox is for the
opposite case, a screen that stays dark with the native driver.

The kernel is loaded with `kexec -s` (`kexec_file_load`) and, if that fails, with `kexec -l`.
The ISO must ship `boot/grub/loopback.cfg`; its first menu entry is used.

Needs `bsdtar` (libarchive), `kexec-tools`, `blkid` and `sudo`. For btrfs, `btrfs-progs`.

## Icon

`assets/extension_icon.png` is a neutral placeholder. Replace it with a
512x512 icon for this extension before shipping it, and update the manifest's
`icon` field if you rename the file.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/grub-loopback/<command>'
```
