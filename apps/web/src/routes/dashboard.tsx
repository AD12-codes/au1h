import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Activity,
  AppWindow,
  ArrowRight,
  BookOpen,
  Plus,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading";
import { Mono } from "@/components/shared/mono";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActiveBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApplications } from "@/hooks/use-applications";
import { useUsers } from "@/hooks/use-users";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const session = await authClient.getSession();
    return { session };
  },
});

const STEPS = [
  {
    title: "Register an application",
    body: "Give it a name and a slug. The slug is what your app sends as x-app-id.",
  },
  {
    title: "Point your client at au1h",
    body: "Sign users in against /api/auth/* with the x-app-id header. Same email, separate user per app.",
  },
  {
    title: "Verify on your backend",
    body: "Check the JWT (EdDSA, aud = your slug) against /api/auth/jwks, or sit behind the proxy.",
  },
];

function RouteComponent() {
  const { session } = Route.useLoaderData();
  const { data: applications, isLoading } = useApplications();
  const { data: users } = useUsers({ page: 1, limit: 1 });

  const apps = applications ?? [];
  const sessions = apps.reduce((n, a) => n + (a.sessionCount ?? 0), 0);
  const recent = [...apps]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);
  const firstName = session.data?.user.name?.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        actions={
          <Button asChild size="sm">
            <Link to="/applications">
              <Plus /> New application
            </Link>
          </Button>
        }
        description="Applications, users and sessions in your workspace."
        title={`Good to see you, ${firstName}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={AppWindow}
          label="Applications"
          value={isLoading ? "–" : apps.length}
        />
        <StatCard
          hint="Across all your applications"
          icon={Users}
          label="Users"
          value={users ? users.total : "–"}
        />
        <StatCard
          icon={Activity}
          label="Active sessions"
          value={isLoading ? "–" : sessions}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">Recent applications</h2>
            <Button asChild size="sm" variant="ghost">
              <Link to="/applications">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          {isLoading && <TableSkeleton rows={3} />}
          {!isLoading && recent.length === 0 && (
            <EmptyState
              action={
                <Button asChild size="sm">
                  <Link to="/applications">
                    <Plus /> Create your first application
                  </Link>
                </Button>
              }
              description="Register a product to start issuing sessions and tokens for it."
              icon={AppWindow}
              title="No applications yet"
            />
          )}
          {!isLoading && recent.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">
                      <Link
                        className="hover:underline"
                        params={{ id: app.id }}
                        to="/applications/$id"
                      >
                        {app.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Mono>{app.slug}</Mono>
                    </TableCell>
                    <TableCell>
                      <ActiveBadge active={app.isActive} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {app.userCount ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {app.sessionCount ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="font-medium text-sm">Getting started</h2>
          <ol className="space-y-3 rounded-lg border bg-card p-4">
            {STEPS.map((step, i) => (
              <li className="flex gap-3" key={step.title}>
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border bg-muted font-mono text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <div className="space-y-0.5">
                  <p className="font-medium text-[13px]">{step.title}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
            <li>
              <Button asChild className="w-full" size="sm" variant="outline">
                <Link to="/docs">
                  <BookOpen /> Read the integration guide
                </Link>
              </Button>
            </li>
          </ol>
        </aside>
      </div>
    </>
  );
}
