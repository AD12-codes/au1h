/**
 * au1h's own cookies never leave au1h.
 *
 * The gateway shares an origin with `/api/auth`, so a browser sends the au1h
 * session cookie on every proxied call. Forwarding it would hand each backend
 * a credential that works against au1h itself (the session, valid for days)
 * when all it needs is the identity the gateway already injects. Cookies a
 * backend set for itself are left alone.
 */
const SECURITY_PREFIX = /^__(?:Secure|Host)-/i;
const BETTER_AUTH_PREFIX = "better-auth.";
const APP_COOKIE = "au1h-app-id";

function isAu1hCookie(name: string): boolean {
  const bare = name.replace(SECURITY_PREFIX, "").toLowerCase();
  return bare.startsWith(BETTER_AUTH_PREFIX) || bare === APP_COOKIE;
}

/**
 * Remove au1h's cookies from a `Cookie` header value. Returns `null` when
 * nothing is left, so the caller can omit the header altogether.
 */
export function stripAu1hCookies(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const kept = header
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => {
      if (!pair) {
        return false;
      }
      const eq = pair.indexOf("=");
      return !isAu1hCookie(eq === -1 ? pair : pair.slice(0, eq).trim());
    });
  return kept.length > 0 ? kept.join("; ") : null;
}
