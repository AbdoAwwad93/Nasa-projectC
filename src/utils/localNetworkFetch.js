// Mark loopback and private-LAN requests so supporting browsers can apply
// Local Network Access rules. Public hosted APIs should keep the browser's
// default address-space detection instead of being mislabeled as LAN traffic.
function targetAddressSpaceFor(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host === '::1' || host.startsWith('127.')) {
    return 'loopback';
  }

  if (host.endsWith('.local') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return 'local';
  }

  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    const [first, second] = octets;
    if (first === 10
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 169 && second === 254)) {
      return 'local';
    }
  }

  return undefined;
}

export function fetchLocalNetwork(url, options = {}) {
  const hostname = new URL(url, window.location.href).hostname;
  const targetAddressSpace = targetAddressSpaceFor(hostname);
  return fetch(url, {
    ...options,
    ...(targetAddressSpace ? { targetAddressSpace } : {}),
  });
}
