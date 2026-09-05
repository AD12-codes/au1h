import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Ban, ShieldOff } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BanUserDialog } from "@/components/users/ban-user-dialog";
import { UserInfoCard } from "@/components/users/user-info-card";
import { UserSessionsList } from "@/components/users/user-sessions-list";
import { UserStatusBadge } from "@/components/users/users-table";
import { useUnbanUser, useUser } from "@/hooks/use-users";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/users/$id")({
  component: UserDetailPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
});

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 hover:text-foreground"
      to="/users"
    >
      <ArrowLeft className="size-3.5" /> Users
    </Link>
  );
}

function UserDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useUser(id);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const unbanMutation = useUnbanUser();

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-5 h-14 w-1/2" />
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const user = data?.user;
  if (!user) {
    return <PageHeader eyebrow={<BackLink />} title="User not found" />;
  }

  return (
    <>
      <PageHeader
        actions={
          user.banned ? (
            <Button
              disabled={unbanMutation.isPending}
              onClick={() => unbanMutation.mutateAsync(user.id)}
              size="sm"
              variant="outline"
            >
              <ShieldOff />
              {unbanMutation.isPending ? "Unbanning…" : "Unban"}
            </Button>
          ) : (
            <Button
              onClick={() => setShowBanDialog(true)}
              size="sm"
              variant="outline"
            >
              <Ban /> Ban user
            </Button>
          )
        }
        description={user.email}
        eyebrow={<BackLink />}
        title={
          <>
            {user.name}
            <UserStatusBadge user={user} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <UserInfoCard user={user} />
        <UserSessionsList userId={user.id} />
      </div>

      <BanUserDialog
        onOpenChange={setShowBanDialog}
        open={showBanDialog}
        user={user}
      />
    </>
  );
}
