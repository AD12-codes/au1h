import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    throw redirect({ to: session.data ? "/dashboard" : "/login" });
  },
});
