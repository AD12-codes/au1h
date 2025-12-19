import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ApplicationStats } from "@/components/applications/application-stats";
import { IntegrationSection } from "@/components/applications/integration-section";
import { SecretDialog } from "@/components/applications/secret-dialog";
import { SettingsForm } from "@/components/applications/settings-form";
import { RouteFormDialog } from "@/components/routes/route-form-dialog";
import { RoutesTable } from "@/components/routes/routes-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  if (error instanceof Error) {
    return error.message;
  }
  return "An error occurred";
}

function LoadingState() {
  return (
    <div className="container mx-auto max-w-3xl py-8">
      <Skeleton className="mb-6 h-10 w-48" />
      <Skeleton className="mb-8 h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="container mx-auto max-w-3xl py-8">
      <p className="text-muted-foreground">Application not found</p>
    </div>
  );
}

function ApplicationDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: application, isLoading } = useApplication(id);
  const updateMutation = useUpdateApplication();
  const regenerateSecretMutation = useRegenerateSecret();

  const [formData, setFormData] = useState<UpdateApplicationInput | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<AppRoute | null>(null);

  const { data: routes = [], isLoading: routesLoading } = useRoutes(id);

  // Initialize form data when application loads
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
    return <NotFoundState />;
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
    <div className="container mx-auto max-w-3xl py-8">
      <Button
        className="mb-6"
        onClick={() => navigate({ to: "/applications" })}
        variant="ghost"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to Applications
      </Button>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-3xl tracking-tight">
              {application.name}
            </h1>
            {isSystemApp && <Badge variant="secondary">System App</Badge>}
          </div>
          <p className="text-muted-foreground">
            Application ID: <code className="text-sm">{application.id}</code>
          </p>
        </div>
        <Badge variant={application.isActive ? "default" : "secondary"}>
          {application.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <ApplicationStats
        sessionCount={application.sessionCount || 0}
        userCount={application.userCount || 0}
      />

      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>
            Update your application configuration
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

          <Separator className="my-8" />

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">Application Secret</h3>
              <p className="text-muted-foreground text-sm">
                The secret is used by your backend to authenticate with au1h.
                Regenerating will invalidate the old secret.
              </p>
            </div>
            <Button
              disabled={regenerateSecretMutation.isPending}
              onClick={handleRegenerateSecret}
              variant="outline"
            >
              <RefreshCw className="mr-2 size-4" />
              {regenerateSecretMutation.isPending
                ? "Regenerating..."
                : "Regenerate Secret"}
            </Button>
          </div>

          <Separator className="my-8" />

          <IntegrationSection
            applicationId={application.id}
            slug={application.slug}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Proxy Routes</CardTitle>
              <CardDescription>
                Configure routes to proxy requests to your backend services
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingRoute(null);
                setRouteDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="mr-2 size-4" />
              Add Route
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {routesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <RoutesTable
              onEdit={(route) => {
                setEditingRoute(route);
                setRouteDialogOpen(true);
              }}
              routes={routes}
            />
          )}
        </CardContent>
      </Card>

      <SecretDialog onClose={() => setNewSecret(null)} secret={newSecret} />

      <RouteFormDialog
        applicationId={id}
        onOpenChange={setRouteDialogOpen}
        open={routeDialogOpen}
        route={editingRoute}
      />
    </div>
  );
}
