import type { Context, MiddlewareHandler } from "hono";
import {
  Au1hAuthError,
  type Au1hClaims,
  type Au1hUser,
  type ProxyContext,
  readProxyContext,
  userFromClaims,
  type Verifier,
} from "./index";

export {
  Au1hAuthError,
  type Au1hClaims,
  type Au1hOptions,
  type Au1hUser,
  createServerClient,
  createVerifier,
  type IntrospectResult,
  type ProxyContext,
  readProxyContext,
  type ServerClientOptions,
  userFromClaims,
  type Verifier,
} from "./index";

export type Au1hVariables = {
  au1hUser: Au1hUser;
  au1hClaims: Au1hClaims;
};

export type Au1hEnv = { Variables: Au1hVariables };

function reject(c: Context, err: unknown) {
  const e =
    err instanceof Au1hAuthError ? err : new Au1hAuthError("unauthorized");
  return c.json({ error: e.message, code: e.code }, e.status);
}

/**
 * Hono middleware: requires `Authorization: Bearer <au1h JWT>` and sets
 * `c.get("au1hUser")` / `c.get("au1hClaims")`.
 *
 * ```ts
 * const au1h = createVerifier({ au1hUrl, appSlug });
 * app.use("/api/*", requireAu1hUser(au1h));
 * app.get("/api/me", (c) => c.json(c.get("au1hUser")));
 * ```
 */
export function requireAu1hUser(
  verifier: Verifier
): MiddlewareHandler<Au1hEnv> {
  return async (c, next) => {
    try {
      const claims = await verifier.verifyAuthorization(
        c.req.header("authorization")
      );
      c.set("au1hClaims", claims);
      c.set("au1hUser", userFromClaims(claims));
    } catch (err) {
      return reject(c, err);
    }
    await next();
  };
}

export type Au1hProxyEnv = { Variables: { au1hProxy: ProxyContext } };

/**
 * Hono middleware for backends behind the au1h gateway: reads the trusted
 * `x-user-*` headers and, when a verifier is given, checks `x-au1h-token`
 * so the request provably came through au1h.
 */
export function requireAu1hProxy(
  verifier?: Verifier
): MiddlewareHandler<Au1hProxyEnv> {
  return async (c, next) => {
    const ctx = readProxyContext(c.req.raw.headers);
    if (!ctx) {
      return reject(
        c,
        new Au1hAuthError("missing au1h gateway headers", 401, "NOT_PROXIED")
      );
    }
    if (verifier) {
      try {
        await verifier.verifyProxyToken(ctx.proxyToken, {
          userId: ctx.user.id,
          email: ctx.user.email,
        });
      } catch (err) {
        return reject(c, err);
      }
    }
    c.set("au1hProxy", ctx);
    await next();
  };
}
