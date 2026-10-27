# @au1h/client

Browser SDK for [au1h](https://github.com/AD12-codes/au1h): a Better Auth client bound to your
application, plus JWT and gateway helpers.

```bash
npm i @au1h/client better-auth
```

```ts
import { createAu1hClient } from "@au1h/client";        // or "@au1h/client/react"

export const auth = createAu1hClient({
  baseURL: "https://auth.example.com",
  appSlug: "my-app",
});

await auth.signUp.email({ email, password, name });
await auth.signIn.email({ email, password });

const token = await auth.getToken();                        // fresh JWT, cached
const res = await auth.authFetch("https://api.my-app.com/me"); // Authorization: Bearer
const todos = await auth.proxyFetch("/todos");              // through the au1h gateway
await auth.signOut();
```

Everything from Better Auth's client is available (`useSession` on the React entry,
`organization.*` if you pass `organizationClient()` in `plugins`), and every call carries
`x-app-id: my-app`.
