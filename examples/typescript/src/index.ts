import { createVerifier } from "@au1h/server";
import { type Au1hEnv, requireAu1hUser } from "@au1h/server/hono";
import { file } from "bun";
import { Hono } from "hono";

const PORT = Number(process.env.PORT ?? 8084);
const AU1H_URL = process.env.AU1H_URL ?? "http://localhost:4444";
const APP_SLUG = process.env.AU1H_APP_SLUG ?? "example-typescript";

// Verifies au1h JWTs against the public JWKS: EdDSA signature, exp,
// iss = au1h, aud = this application's slug.
const au1h = createVerifier({ au1hUrl: AU1H_URL, appSlug: APP_SLUG });

const app = new Hono<Au1hEnv>();

app.get("/", () => new Response(file("index.html")));
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/api/config", (c) =>
  c.json({ language: "typescript", au1hUrl: au1h.au1hUrl, appSlug: APP_SLUG })
);

// Everything under /api/me requires a valid au1h token for this app.
app.use("/api/me", requireAu1hUser(au1h));
app.get("/api/me", (c) => {
  const user = c.get("au1hUser");
  const claims = c.get("au1hClaims");
  return c.json({
    language: "typescript",
    library: "@au1h/server (jose)",
    user,
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
