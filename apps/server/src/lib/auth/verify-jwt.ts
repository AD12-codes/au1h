import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify } from "jose";

const AU1H_URL = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");

/**
 * au1h's own JWKS. Resolved lazily so importing this module has no side
 * effects; `createRemoteJWKSet` caches keys and refetches on unknown `kid`s.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${AU1H_URL}/api/auth/jwks`));
  }
  return jwks;
}

export interface Au1hJwtClaims extends JWTPayload {
  sub: string;
  email: string;
  name?: string;
  applicationId?: string | null;
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/**
 * Verify a JWT minted by this au1h instance (`GET /api/auth/token`):
 * EdDSA signature against our JWKS, `exp`, `iss` equal to our URL, and `aud`
 * equal to the application slug the token was minted for.
 */
export async function verifyAu1hJwt(
  token: string,
  expectedAudience: string
): Promise<Au1hJwtClaims> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["EdDSA"],
      issuer: AU1H_URL,
      audience: expectedAudience,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new InvalidTokenError("token is missing sub or email");
    }
    return payload as Au1hJwtClaims;
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      throw err;
    }
    const code = err instanceof errors.JOSEError ? err.code : "INVALID_TOKEN";
    throw new InvalidTokenError(code);
  }
}
