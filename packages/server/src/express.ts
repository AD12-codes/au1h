import type {
  Request as ExpressRequest,
  NextFunction,
  RequestHandler,
  Response,
} from "express";
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

declare global {
  // biome-ignore lint/style/noNamespace: Express augments Request through this namespace
  namespace Express {
    interface Request {
      au1hUser?: Au1hUser;
      au1hClaims?: Au1hClaims;
      au1hProxy?: ProxyContext;
    }
  }
}

function reject(res: Response, err: unknown) {
  const e =
    err instanceof Au1hAuthError ? err : new Au1hAuthError("unauthorized");
  res.status(e.status).json({ error: e.message, code: e.code });
}

/**
 * Express middleware: requires `Authorization: Bearer <au1h JWT>` and sets
 * `req.au1hUser` / `req.au1hClaims`.
 */
export function requireAu1hUser(verifier: Verifier): RequestHandler {
  return async (req: ExpressRequest, res: Response, next: NextFunction) => {
    try {
      const claims = await verifier.verifyAuthorization(
        req.headers.authorization
      );
      req.au1hClaims = claims;
      req.au1hUser = userFromClaims(claims);
      next();
    } catch (err) {
      reject(res, err);
    }
  };
}

/** Express middleware for backends behind the au1h gateway. See the Hono variant. */
export function requireAu1hProxy(verifier?: Verifier): RequestHandler {
  return async (req: ExpressRequest, res: Response, next: NextFunction) => {
    const ctx = readProxyContext(req.headers);
    if (!ctx) {
      return reject(
        res,
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
        return reject(res, err);
      }
    }
    req.au1hProxy = ctx;
    next();
  };
}
