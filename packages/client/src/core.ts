/**
 * Framework-agnostic pieces shared by the vanilla and React entry points.
 */

export interface Au1hClientOptions {
  /** au1h base URL, e.g. "https://auth.example.com" (no trailing slash). */
  baseURL: string;
  /** Your application's slug from the au1h admin portal. Sent as `x-app-id`. */
  appSlug: string;
  /**
   * Where to keep the JWT between page loads. Defaults to `localStorage`
   * (keyed by app slug) in browsers and to memory elsewhere.
   */
  tokenStorage?: TokenStorage;
  /** Refresh the JWT this many seconds before it expires. Default 60. */
  refreshLeewaySeconds?: number;
}

export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export interface Au1hJwtClaims {
  sub: string;
  email: string;
  name?: string;
  applicationId?: string | null;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}

export class Au1hError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "Au1hError";
  }
}

const TRAILING_SLASHES = /\/+$/;

export function normalizeBaseURL(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

export function memoryStorage(): TokenStorage {
  let value: string | null = null;
  return {
    get: () => value,
    set: (t) => {
      value = t;
    },
    clear: () => {
      value = null;
    },
  };
}

export function localStorageStorage(key: string): TokenStorage {
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    get: () => safe(() => globalThis.localStorage.getItem(key), null),
    set: (t) => safe(() => globalThis.localStorage.setItem(key, t), undefined),
    clear: () => safe(() => globalThis.localStorage.removeItem(key), undefined),
  };
}

export function defaultStorage(appSlug: string): TokenStorage {
  return typeof globalThis.localStorage === "undefined"
    ? memoryStorage()
    : localStorageStorage(`au1h:${appSlug}:jwt`);
}

/** Decode (not verify) the JWT payload. Verification is the backend's job. */
export function decodeJwt(token: string): Au1hJwtClaims | null {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Au1hJwtClaims;
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<Au1hError> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    code?: string;
  };
  return new Au1hError(
    body.message ?? body.error ?? `${res.status} ${res.statusText}`,
    res.status,
    body.code
  );
}

/**
 * JWT management and fetch helpers. Independent of the Better Auth client so
 * it can be used from plain scripts too.
 */
export function createTokenManager(options: Au1hClientOptions) {
  const baseURL = normalizeBaseURL(options.baseURL);
  const storage = options.tokenStorage ?? defaultStorage(options.appSlug);
  const leeway = options.refreshLeewaySeconds ?? 60;
  let inflight: Promise<string> | null = null;

  const isFresh = (token: string | null): token is string => {
    if (!token) {
      return false;
    }
    const claims = decodeJwt(token);
    return !!claims && claims.exp - leeway > Date.now() / 1000;
  };

  const mint = async (): Promise<string> => {
    const res = await fetch(`${baseURL}/api/auth/token`, {
      credentials: "include",
      headers: { "x-app-id": options.appSlug },
    });
    if (!res.ok) {
      storage.clear();
      throw await readError(res);
    }
    const { token } = (await res.json()) as { token: string };
    storage.set(token);
    return token;
  };

  /**
   * A valid JWT for the signed-in user. Served from storage while fresh,
   * otherwise minted from the session cookie. Throws `Au1hError` (401) when
   * there is no session.
   */
  const getToken = (): Promise<string> => {
    const cached = storage.get();
    if (isFresh(cached)) {
      return Promise.resolve(cached);
    }
    if (!inflight) {
      inflight = mint().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };

  /** `fetch` with `Authorization: Bearer <jwt>` added. For your own backend. */
  const authFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  /**
   * `fetch` through the au1h gateway: `path` is appended to `/proxy` and the
   * session cookie plus `x-app-id` are sent. The backend receives trusted
   * `x-user-id` / `x-user-email` headers.
   */
  const proxyFetch = (
    path: string,
    init: RequestInit = {}
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("x-app-id", options.appSlug);
    const url = `${baseURL}/proxy${path.startsWith("/") ? path : `/${path}`}`;
    return fetch(url, { ...init, headers, credentials: "include" });
  };

  return {
    getToken,
    authFetch,
    proxyFetch,
    /** Forget the cached JWT (call after sign-out). */
    clearToken: () => storage.clear(),
    /** The cached token's claims, if any. Not verified. */
    getClaims: () => decodeJwt(storage.get() ?? ""),
  };
}

export type TokenManager = ReturnType<typeof createTokenManager>;

/**
 * Better Auth client options that make every call carry the app slug, and
 * drop the cached JWT when the user signs out.
 */
export function betterAuthClientOptions(
  options: Au1hClientOptions,
  tokens: Pick<TokenManager, "clearToken">
) {
  return {
    baseURL: normalizeBaseURL(options.baseURL),
    fetchOptions: {
      credentials: "include" as const,
      headers: { "x-app-id": options.appSlug },
      onResponse: (ctx: { response: Response }) => {
        if (ctx.response.url.includes("/sign-out")) {
          tokens.clearToken();
        }
      },
    },
  };
}
