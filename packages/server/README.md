# @au1h/server

Backend SDK for [au1h](https://github.com/AD12-codes/au1h). Verifies au1h JWTs against the
public JWKS (EdDSA, `iss` = au1h, `aud` = your slug), reads the gateway's trusted headers,
and calls the server-to-server API with your application secret.

```bash
npm i @au1h/server
```

```ts
import { createVerifier } from "@au1h/server";
import { requireAu1hUser } from "@au1h/server/hono";   // or "@au1h/server/express"

const au1h = createVerifier({ au1hUrl: "https://auth.example.com", appSlug: "my-app" });

app.use("/api/*", requireAu1hUser(au1h));
app.get("/api/me", (c) => c.json(c.get("au1hUser")));
```

Behind the gateway (`/proxy/*`):

```ts
import { requireAu1hProxy } from "@au1h/server/hono";
app.use("/*", requireAu1hProxy(au1h));   // verifies x-au1h-token, exposes c.get("au1hProxy")
```

Server-to-server:

```ts
import { createServerClient } from "@au1h/server";
const s2s = createServerClient({ au1hUrl, appSlug: "my-app", appSecret: process.env.AU1H_APP_SECRET! });
const { active, user } = await s2s.introspect(token);
```
