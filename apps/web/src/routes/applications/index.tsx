import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppWindow, Plus } from "lucide-react";
import { useState } from "react";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { DeleteApplicationDialog } from "@/components/applications/delete-application-dialog";
import { SecretDialog } from "@/components/applications/secret-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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

  const count = applications?.length ?? 0;

  const renderContent = () => {
    if (isLoading) {
      return <TableSkeleton />;
    }
    if (!applications?.length) {
      return (
        <EmptyState
          action={
            <Button onClick={() => setIsCreateOpen(true)} size="sm">
              <Plus /> New application
            </Button>
          }
          description="Each application gets its own slug, users, sessions and secret."
          icon={AppWindow}
          title="No applications yet"
        />
      );
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
    <>
      <PageHeader
        actions={
          <Button onClick={() => setIsCreateOpen(true)} size="sm">
            <Plus /> New application
          </Button>
        }
        description={
          isLoading
            ? "Loading…"
            : `${count} application${count === 1 ? "" : "s"} registered in this workspace.`
        }
        title="Applications"
      />

      {renderContent()}

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
    </>
  );
}
