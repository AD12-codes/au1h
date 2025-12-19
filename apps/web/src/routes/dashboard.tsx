import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AppWindow, Users } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
  },
  loader: async () => {
    const session = await authClient.getSession();
    return { session };
  },
});

function RouteComponent() {
  const loaderData = Route.useLoaderData();
  const { session } = loaderData;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-bold text-3xl tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.data?.user.name || "User"}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link to="/applications">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <AppWindow className="size-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Applications</CardTitle>
                  <CardDescription>
                    Manage registered applications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/users">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Users className="size-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Manage users across apps</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Debug Info - collapsible */}
      <details className="mt-8">
        <summary className="cursor-pointer text-muted-foreground text-sm">
          Session Debug Info
        </summary>
        <pre className="mt-2 rounded-lg bg-muted p-4 text-sm">
          {JSON.stringify(session.data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
