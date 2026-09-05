/**
 * Validation for proxy route backend URLs.
 *
 * au1h fetches these URLs on behalf of clients, so an attacker who can register
 * a route can otherwise use au1h as an SSRF proxy into private networks. In
 * production, private/loopback/link-local targets are rejected unless
 * `AU1H_PROXY_ALLOW_PRIVATE_BACKENDS=true`. Outside production they are
 * allowed, because local development backends live on localhost.
 *
 * Note: this checks the literal hostname only. A public DNS name that resolves
 * to a private address (DNS rebinding) is not detected here.
 */

const PRIVATE_IPV4 = [
  /^0\./, // "this" network
  /^10\./,
  /^127\./,
  /^169\.254\./, // link-local / cloud metadata
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_UNIQUE_LOCAL = /^f[cd][0-9a-f]{2}:/; // fc00::/7
const IPV6_LINK_LOCAL = /^fe[89ab][0-9a-f]:/; // fe80::/10
const IPV6_MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

export function isPrivateHostname(hostnameRaw: string): boolean {
  const hostname = hostnameRaw.toLowerCase().replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }
  if (hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    return true;
  }
  if (IPV4.test(hostname)) {
    return PRIVATE_IPV4.some((re) => re.test(hostname));
  }
  if (hostname.includes(":")) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10),
    // and IPv4-mapped addresses.
    if (hostname === "::1" || hostname === "::") {
      return true;
    }
    if (IPV6_UNIQUE_LOCAL.test(hostname) || IPV6_LINK_LOCAL.test(hostname)) {
      return true;
    }
    const mapped = hostname.match(IPV6_MAPPED_IPV4);
    if (mapped) {
      return isPrivateHostname(mapped[1]);
    }
  }
  return false;
}

export interface BackendUrlPolicy {
  allowPrivate: boolean;
}

export function defaultBackendUrlPolicy(): BackendUrlPolicy {
  const explicit = process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS;
  if (explicit !== undefined) {
    return { allowPrivate: explicit === "true" };
  }
  return { allowPrivate: process.env.NODE_ENV !== "production" };
}

/**
 * Returns `null` when the URL is acceptable, otherwise a human-readable reason.
 */
export function validateBackendUrl(
  raw: string,
  policy: BackendUrlPolicy = defaultBackendUrlPolicy()
): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "backendUrl must be an absolute URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "backendUrl must use http or https";
  }
  if (url.username || url.password) {
    return "backendUrl must not contain credentials";
  }
  if (!url.hostname) {
    return "backendUrl must have a host";
  }
  if (!policy.allowPrivate && isPrivateHostname(url.hostname)) {
    return "backendUrl must not point at a private or loopback address";
  }
  return null;
}
