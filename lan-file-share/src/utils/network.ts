import type { NetworkInterfaceInfo } from "node:os";

export type NetworkInterface = {
  name: string;
  address: string;
};

/**
 * Devices that container and VM tooling creates: Docker (`docker0`, `br-<id>`), Podman, libvirt, LXC/LXD,
 * Kubernetes CNI, and the `veth*` ends of container links. They carry an IPv4 address nobody on the Wi-Fi can
 * reach, and sorting by name alone put them ahead of `wlp3s0` and `enp4s0`.
 */
const VIRTUAL_NAME = /^(docker|br-|veth|virbr|lxcbr|lxdbr|podman|cni|flannel)/;

/**
 * Non-loopback interfaces that actually carry an IPv4 address, real network cards first. Loopback and
 * interfaces without IPv4 are not candidate addresses: nobody on the local network can reach those. Virtual
 * devices stay selectable, they just never become the default.
 */
export function rankInterfaces(raw: NodeJS.Dict<NetworkInterfaceInfo[]>): NetworkInterface[] {
  const interfaces: NetworkInterface[] = [];
  for (const [name, addresses] of Object.entries(raw)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      interfaces.push({ name, address: address.address });
    }
  }
  return interfaces.sort(
    (left, right) =>
      Number(VIRTUAL_NAME.test(left.name)) - Number(VIRTUAL_NAME.test(right.name)) ||
      left.name.localeCompare(right.name) ||
      left.address.localeCompare(right.address),
  );
}

export function pickSelectedInterface(host: string | undefined, interfaces: NetworkInterface[]): string {
  if (host && interfaces.some((item) => item.address === host)) return host;
  return interfaces[0]?.address ?? "";
}
