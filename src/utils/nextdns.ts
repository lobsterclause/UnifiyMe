/**
 * Formats a device name for NextDNS DNS-over-TLS/QUIC.
 * Prepend the name to the provided domain (the name should only contain a-z, A-Z, 0-9 and -).
 * Use -- for spaces.
 * Example: For "John Router", you would use John--Router-6ca463.dns.nextdns.io
 */
export function formatDoT(deviceName: string, configId: string): string {
  const sanitized = deviceName
    .replace(/ /g, '--')
    .replace(/[^a-zA-Z0-9-]/g, '');
  return `${sanitized}-${configId}.dns.nextdns.io`;
}

/**
 * Formats the router's own DoT endpoint.
 * Example: For "John Router", you would use John--Router-6ca463.dns.nextdns.io
 */
export function getRouterDoTEndpoint(routerName: string, configId: string): string {
  return formatDoT(routerName, configId);
}

/**
 * Formats a device name for NextDNS DNS-over-HTTPS.
 * Append the name to the provided URL (the name should be URL encoded).
 * Example: For "John's Firefox", you would use https://dns.nextdns.io/6ca463/John's%20Firefox
 */
export function formatDoH(deviceName: string, configId: string): string {
  // Note: NextDNS example shows "John's%20Firefox", encodeURIComponent would encode ' as %27.
  // However, the instructions say "URL encoded".
  // Let's stick to standard encodeURIComponent but maybe NextDNS is picky about what it encodes.
  // Actually, encodeURIComponent does NOT encode ' (single quote).
  // So encodeURIComponent("John's Firefox") -> "John's%20Firefox" which matches the example!
  return `https://dns.nextdns.io/${configId}/${encodeURIComponent(deviceName)}`;
}
