import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Activity, ArrowLeft, Plus, RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import { IntegrationSection } from "@/components/applications/integration-section";
import { SecretDialog } from "@/components/applications/secret-dialog";
import { SettingsForm } from "@/components/applications/settings-form";
import { RouteFormDialog } from "@/components/routes/route-form-dialog";
import { RoutesTable } from "@/components/routes/routes-table";
import { TableSkeleton } from "@/components/shared/loading";
import { Mono } from "@/components/shared/mono";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActiveBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplication,
  useRegenerateSecret,
  useUpdateApplication,
} from "@/hooks/use-applications";
import type { AppRoute } from "@/hooks/use-routes";
import { useRoutes } from "@/hooks/use-routes";
import type { UpdateApplicationInput } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/applications/$id")({
  component: ApplicationDetailPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
});

function getErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  return error instanceof Error ? error.message : "An error occurred";
}

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 hover:text-foreground"
      to="/applications"
    >
      <ArrowLeft className="size-3.5" /> Applications
    </Link>
  );
}

function LoadingState() {
  return (
    <>
      <Skeleton className="mb-5 h-14 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </>
  );
}

function ApplicationDetailPage() {
  const { id } = Route.useParams();
  const { data: application, isLoading } = useApplication(id);
  const updateMutation = useUpdateApplication();
  const regenerateSecretMutation = useRegenerateSecret();

  const [formData, setFormData] = useState<UpdateApplicationInput | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<AppRoute | null>(null);

  const { data: routes = [], isLoading: routesLoading } = useRoutes(id);

  if (application && !formData) {
    setFormData({
      name: application.name,
      slug: application.slug,
      allowedOrigins: application.allowedOrigins || "",
      redirectUris: application.redirectUris || "",
      logo: application.logo,
      isActive: application.isActive,
    });
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!(application && formData)) {
    return <PageHeader eyebrow={<BackLink />} title="Application not found" />;
  }

  const isSystemApp = application.metadata
    ? JSON.parse(application.metadata).isSystemApp
    : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({ id, data: formData });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRegenerateSecret = async () => {
    try {
      const { secret } = await regenerateSecretMutation.mutateAsync(id);
      setNewSecret(secret);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setEditingRoute(null);
              setRouteDialogOpen(true);
            }}
            size="sm"
            variant="outline"
          >
            <Plus /> Add route
          </Button>
        }
        description={
          <span className="flex items-center gap-2">
            <Mono>{application.slug}</Mono>
            <span className="text-muted-foreground/60">·</span>
            <span>
              created {new Date(application.createdAt).toLocaleDateString()}
            </span>
          </span>
        }
        eyebrow={<BackLink />}
        title={
          <>
            {application.name}
            <ActiveBadge active={application.isActive} />
            {isSystemApp && <Badge variant="info">System</Badge>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Settings</CardTitle>
              <CardDescription>
                Name, slug, allowed origins and redirect URIs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsForm
                error={getErrorMessage(updateMutation.error)}
                formData={formData}
                isLoading={updateMutation.isPending}
                isSystemApp={isSystemApp}
                onChange={setFormData}
                onSubmit={handleSubmit}
                success={success}
              />
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-sm">Proxy routes</h2>
                <p className="text-muted-foreground text-xs">
                  Requests to <Mono>/proxy/&lt;pattern&gt;</Mono> are
                  authenticated by au1h and forwarded to your backend.
                </p>
              </div>
            </div>
            {routesLoading ? (
              <TableSkeleton rows={2} />
            ) : (
              <RoutesTable
                onAdd={() => {
                  setEditingRoute(null);
                  setRouteDialogOpen(true);
                }}
                onEdit={(route) => {
                  setEditingRoute(route);
                  setRouteDialogOpen(true);
                }}
                routes={routes}
              />
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Users}
              label="Users"
              value={application.userCount ?? 0}
            />
            <StatCard
              icon={Activity}
              label="Sessions"
              value={application.sessionCount ?? 0}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Integration</CardTitle>
              <CardDescription>
                Values your client and backend need.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IntegrationSection
                applicationId={application.id}
                slug={application.slug}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secret</CardTitle>
              <CardDescription>
                Authenticates your backend to the server-to-server API. Shown
                once; regenerating invalidates the old one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                disabled={regenerateSecretMutation.isPending}
                onClick={handleRegenerateSecret}
                size="sm"
                variant="outline"
              >
                <RefreshCw
                  className={
                    regenerateSecretMutation.isPending ? "animate-spin" : ""
                  }
                />
                {regenerateSecretMutation.isPending
                  ? "Regenerating…"
                  : "Regenerate secret"}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <SecretDialog onClose={() => setNewSecret(null)} secret={newSecret} />
      <RouteFormDialog
        applicationId={id}
        onOpenChange={setRouteDialogOpen}
        open={routeDialogOpen}
        route={editingRoute}
      />
    </>
  );
}
