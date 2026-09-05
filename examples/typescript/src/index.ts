import { file } from "bun";
import { Hono } from "hono";
import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify } from "jose";

const PORT = Number(process.env.PORT ?? 8084);
const AU1H_URL = (process.env.AU1H_URL ?? "http://localhost:4444").replace(
  /\/$/,
  ""
);
const APP_SLUG = process.env.AU1H_APP_SLUG ?? "example-typescript";
const APP_ID = process.env.AU1H_APP_ID || null;

// au1h publishes its signing keys (Ed25519 / EdDSA) at /api/auth/jwks.
// createRemoteJWKSet fetches lazily and caches; unknown `kid`s trigger a refetch.
const JWKS = createRemoteJWKSet(new URL(`${AU1H_URL}/api/auth/jwks`));

type Au1hClaims = JWTPayload & {
  email: string;
  name?: string;
  applicationId?: string;
};

async function verifyAu1hToken(token: string): Promise<Au1hClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ["EdDSA"],
    issuer: AU1H_URL,
    audience: AU1H_URL,
  });
  return payload as Au1hClaims;
}

const app = new Hono();

app.get("/", () => new Response(file("index.html")));
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/api/config", (c) =>
  c.json({ language: "typescript", au1hUrl: AU1H_URL, appSlug: APP_SLUG })
);

app.get("/api/me", async (c) => {
  const header = c.req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return c.json({ error: "missing bearer token" }, 401);
  }

  let claims: Au1hClaims;
  try {
    claims = await verifyAu1hToken(header.slice("Bearer ".length));
  } catch (err) {
    const reason = err instanceof errors.JOSEError ? err.code : "invalid token";
    return c.json({ error: `invalid token: ${reason}` }, 401);
  }

  // Tenant check: a token from another au1h application must not be accepted here.
  if (APP_ID && claims.applicationId !== APP_ID) {
    return c.json(
      { error: "token was issued for a different application" },
      403
    );
  }

  return c.json({
    language: "typescript",
    library: "jose",
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name ?? null,
      applicationId: claims.applicationId ?? null,
    },
    token: {
      issuer: claims.iss,
      audience: claims.aud,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
    },
  });
});

console.log(
  `au1h TypeScript example listening on http://localhost:${PORT} (app slug: ${APP_SLUG})`
);

export default { port: PORT, fetch: app.fetch };
