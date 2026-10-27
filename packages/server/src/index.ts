import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify } from "jose";

export interface Au1hOptions {
  /** au1h base URL, e.g. "https://auth.example.com". */
  au1hUrl: string;
  /** Your application's slug. The JWT `aud` must equal it. */
  appSlug: string;
}

export interface Au1hUser {
  id: string;
  email: string;
  name: string | null;
  applicationId: string | null;
}

export interface Au1hClaims extends JWTPayload {
  sub: string;
  email: string;
  name?: string;
  applicationId?: string | null;
  exp: number;
  /** Present (as `"au1h-proxy"`) only on the gateway's `x-au1h-token`. */
  typ?: string;
}

/** `typ` of the gateway proof token. Never accepted as a user access token. */
export const PROXY_TOKEN_TYPE = "au1h-proxy";

function assertClaimShape(
  payload: JWTPayload,
  expectProxy: boolean
): Au1hClaims {
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Au1hAuthError("token is missing sub or email");
  }
  const isProxy = payload.typ === PROXY_TOKEN_TYPE;
  if (isProxy !== expectProxy) {
    throw new Au1hAuthError(
      isProxy
        ? "a gateway proof token is not an access token"
        : "x-au1h-token is not a gateway proof token",
      401,
      "WRONG_TOKEN_TYPE"
    );
  }
  return payload as Au1hClaims;
}

export class Au1hAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
    public readonly code = "INVALID_TOKEN"
  ) {
    super(message);
    this.name = "Au1hAuthError";
  }
}

const TRAILING_SLASHES = /\/+$/;

function normalize(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

export function userFromClaims(claims: Au1hClaims): Au1hUser {
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name ?? null,
    applicationId: claims.applicationId ?? null,
  };
}

/**
 * Verifies JWTs minted by au1h for your application: EdDSA signature against
 * au1h's JWKS (fetched once and cached), `exp`, `iss` = au1h, `aud` = your slug.
 */
export function createVerifier(options: Au1hOptions) {
  const au1hUrl = normalize(options.au1hUrl);
  const jwks = createRemoteJWKSet(new URL(`${au1hUrl}/api/auth/jwks`));

  async function verifyToken(
    token: string,
    expectProxy: boolean
  ): Promise<Au1hClaims> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ["EdDSA"],
        issuer: au1hUrl,
        audience: options.appSlug,
      });
      return assertClaimShape(payload, expectProxy);
    } catch (err) {
      if (err instanceof Au1hAuthError) {
        throw err;
      }
      if (
        err instanceof errors.JWTClaimValidationFailed &&
        err.claim === "aud"
      ) {
        throw new Au1hAuthError(
          "token was issued for another application",
          403,
          "WRONG_AUDIENCE"
        );
      }
      const code = err instanceof errors.JOSEError ? err.code : "INVALID_TOKEN";
      throw new Au1hAuthError(`invalid token: ${code}`, 401, code);
    }
  }

  /** Verify a user access token (from `GET /api/auth/token`). */
  function verify(token: string): Promise<Au1hClaims> {
    return verifyToken(token, false);
  }

  /** Verify the `Authorization: Bearer <jwt>` header value. */
  function verifyAuthorization(
    header: string | null | undefined
  ): Promise<Au1hClaims> {
    if (!header?.startsWith("Bearer ")) {
      return Promise.reject(
        new Au1hAuthError("missing bearer token", 401, "MISSING_TOKEN")
      );
    }
    return verify(header.slice("Bearer ".length).trim());
  }

  /**
   * Verify the `x-au1h-token` header the au1h gateway attaches to proxied
   * requests: proof the request came through au1h, without a shared secret.
   */
  async function verifyProxyToken(
    header: string | null | undefined,
    expected?: { userId: string; email: string }
  ): Promise<Au1hClaims> {
    if (!header) {
      throw new Au1hAuthError(
        "missing x-au1h-token",
        401,
        "MISSING_PROXY_TOKEN"
      );
    }
    const claims = await verifyToken(header, true);
    if (
      expected &&
      (claims.sub !== expected.userId || claims.email !== expected.email)
    ) {
      throw new Au1hAuthError(
        "proxy token does not match x-user-id / x-user-email",
        401,
        "PROXY_MISMATCH"
      );
    }
    return claims;
  }

  return {
    verify,
    verifyAuthorization,
    verifyProxyToken,
    au1hUrl,
    appSlug: options.appSlug,
  };
}

export type Verifier = ReturnType<typeof createVerifier>;

/**
 * The trusted headers au1h injects on proxied requests (`/proxy/*`).
 * Only trust them when the request can only have come from au1h: a private
 * network, or `verifyProxyToken` on `x-au1h-token`.
 */
export interface ProxyContext {
  user: { id: string; email: string };
  appId: string;
  appSlug: string;
  /** Short-lived au1h-signed JWT, present on every proxied request. */
  proxyToken: string | null;
}

export function readProxyContext(
  headers: Headers | Record<string, string | string[] | undefined>
): ProxyContext | null {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  const id = get("x-user-id");
  const email = get("x-user-email");
  const appId = get("x-app-id");
  const appSlug = get("x-app-slug");
  if (!(id && email && appId && appSlug)) {
    return null;
  }
  return {
    user: { id, email },
    appId,
    appSlug,
    proxyToken: get("x-au1h-token"),
  };
}

export interface ServerClientOptions extends Au1hOptions {
  /** The application secret from the admin portal (`au1h_sk_…`). Keep it server-side. */
  appSecret: string;
}

export interface IntrospectResult {
  active: boolean;
  via?: "jwt" | "session";
  user?: { id: string; email: string; name: string | null };
  expiresAt?: number | null;
}

/**
 * Server-to-server calls authenticated with your application secret.
 */
export function createServerClient(options: ServerClientOptions) {
  const au1hUrl = normalize(options.au1hUrl);
  const headers = {
    "x-app-id": options.appSlug,
    "x-app-secret": options.appSecret,
    "content-type": "application/json",
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${au1hUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      throw new Au1hAuthError(
        body.message ?? body.error ?? `${res.status}`,
        res.status === 403 ? 403 : 401,
        "SERVER_CLIENT"
      );
    }
    return (await res.json()) as T;
  }

  return {
    /** Confirms the credentials; returns your application id and slug. */
    me: () =>
      request<{ application: { id: string; slug: string } }>("/api/apps/me"),
    /**
     * Ask au1h whether a token is active. Accepts an au1h JWT or a raw session
     * token; reflects revocation and bans immediately.
     */
    introspect: (token: string) =>
      request<IntrospectResult>("/api/apps/introspect", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  };
}
