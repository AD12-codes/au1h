import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient, signOut } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    try {
      const session = await authClient.getSession();
      console.log("Session in beforeLoad:", session);
      if (!session.data) {
        console.log("No session data, redirecting to login");
        redirect({
          to: "/login",
          throw: true,
        });
      }
      return { session };
    } catch (error) {
      console.error("Error getting session:", error);
      redirect({
        to: "/login",
        throw: true,
      });
    }
  },
});

function RouteComponent() {
  const { data, error } = authClient.useSession();

  console.log("Session data in component:", data);
  console.log("Session error in component:", error);

  /**
   * Secure logout handler
   * Clears all user data, caches, and stores to prevent data leakage
   * SECURITY: GDPR compliance - ensures no user data persists after logout
   */
  const handleSignOut = async () => {
    try {
      // 1. Clear all React Query caches (prevents stale data from showing)
      queryClient.clear();

      // 2. Clear all Zustand stores
      // clearConnection(); // Clears persisted connection data from localStorage
      // resetDatabaseStore();
      // resetReportsStore();
      // resetDownloadStore();

      // 3. Clear localStorage (except theme preferences)
      const theme = localStorage.getItem("theme");
      localStorage.clear();
      if (theme) {
        localStorage.setItem("theme", theme);
      }

      // 4. Clear sessionStorage completely
      sessionStorage.clear();

      // 5. Sign out from authentication service
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            // Force full page reload to clear any remaining state
            window.location.href = "/login";
          },
          onError: () => {
            // Even if server sign-out fails, clear client-side data and redirect
            window.location.href = "/login";
          },
        },
      });
    } catch (logoutError) {
      // SECURITY: Always redirect even if logout fails
      // This prevents users from being stuck in an invalid state
      console.error("Logout error:", logoutError);

      // Clear everything again as a safety measure
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();

      // Force redirect to login
      window.location.href = "/login";
    }
  };

  return (
    <div className="p-8">
      <h1 className="mb-4 font-bold text-2xl">Dashboard</h1>
      <div className="space-y-4">
        <p>Welcome {data?.user.name || data?.user.name}</p>
        <div className="rounded-lg bg-muted p-4">
          <h3 className="mb-2 font-semibold">Session Debug Info:</h3>
          <pre className="text-sm">{JSON.stringify(data || data, null, 2)}</pre>
        </div>
        <Button onClick={handleSignOut}>Logout</Button>
      </div>
    </div>
  );
}
