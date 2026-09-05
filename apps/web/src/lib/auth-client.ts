import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// The admin portal is an explicit, reserved tenant of au1h: every auth request
// identifies itself with `x-app-id: au1h-admin` (the server never infers admin
// scope from the Origin header). Client apps send their own slug instead.
const ADMIN_APP_SLUG = import.meta.env.VITE_AU1H_ADMIN_APP_SLUG || "au1h-admin";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL,
  plugins: [adminClient(), organizationClient()],
  fetchOptions: {
    credentials: "include",
    headers: {
      "x-app-id": ADMIN_APP_SLUG,
    },
  },
});

export const { signIn, signOut, useSession } = authClient;
