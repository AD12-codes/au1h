import { createFileRoute, redirect } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { DeleteApplicationDialog } from "@/components/applications/delete-application-dialog";
import { SecretDialog } from "@/components/applications/secret-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useRegenerateSecret } from "@/hooks/use-applications";
import type { Application } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/applications/")({
  component: ApplicationsPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
});

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center text-muted-foreground">
      No applications yet. Create your first one!
    </div>
  );
}

function ApplicationsPage() {
  const { data: applications, isLoading } = useApplications();
  const regenerateSecretMutation = useRegenerateSecret();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteApp, setDeleteApp] = useState<Application | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const handleRegenerateSecret = async (app: Application) => {
    try {
      const { secret } = await regenerateSecretMutation.mutateAsync(app.id);
      setNewSecret(secret);
    } catch {
      // Error handled by mutation
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <LoadingSkeleton />;
    }
    if (!applications?.length) {
      return <EmptyState />;
    }
    return (
      <ApplicationsTable
        applications={applications}
        onDelete={setDeleteApp}
        onRegenerateSecret={handleRegenerateSecret}
      />
    );
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Applications</h1>
          <p className="text-muted-foreground">
            Manage applications that use au1h for authentication
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          New Application
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Applications</CardTitle>
          <CardDescription>
            {applications?.length || 0} application
            {applications?.length !== 1 && "s"} registered
          </CardDescription>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>

      <CreateApplicationDialog
        onOpenChange={setIsCreateOpen}
        open={isCreateOpen}
      />

      <DeleteApplicationDialog
        application={deleteApp}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteApp(null);
          }
        }}
        open={!!deleteApp}
      />

      <SecretDialog onClose={() => setNewSecret(null)} secret={newSecret} />
    </div>
  );
}
