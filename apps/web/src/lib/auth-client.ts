import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Admin portal application slug - must match the seeded application
const ADMIN_APP_SLUG = "admin-portal";

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
