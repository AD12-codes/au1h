import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ADMIN_APP_SLUG, SERVER_URL } from "./config";

// The admin portal is an explicit, reserved tenant of au1h: every auth request
// identifies itself with `x-app-id: au1h-admin` (the server never infers admin
// scope from the Origin header). Client apps send their own slug instead.

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  plugins: [adminClient(), organizationClient()],
  fetchOptions: {
    credentials: "include",
    headers: {
      "x-app-id": ADMIN_APP_SLUG,
    },
  },
});

export const { signIn, signOut, useSession } = authClient;
