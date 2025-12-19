import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BanUserDialog } from "@/components/users/ban-user-dialog";
import { UserInfoCard } from "@/components/users/user-info-card";
import { UserSessionsList } from "@/components/users/user-sessions-list";
import { useBanUser, useUnbanUser, useUser } from "@/hooks/use-users";
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

function UserDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useUser(id);
  const [showBanDialog, setShowBanDialog] = useState(false);

  const banMutation = useBanUser();
  const unbanMutation = useUnbanUser();

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Skeleton className="mb-6 h-10 w-48" />
        <Skeleton className="mb-8 h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const user = data?.user;

  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  const handleUnban = async () => {
    await unbanMutation.mutateAsync(user.id);
  };

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <Button
        className="mb-6"
        onClick={() => navigate({ to: "/users" })}
        variant="ghost"
      >
        <ArrowLeft className="mr-2 size-4" />
        Back to Users
      </Button>

      <div className="space-y-6">
        <UserInfoCard
          isBanning={banMutation.isPending}
          isUnbanning={unbanMutation.isPending}
          onBan={() => setShowBanDialog(true)}
          onUnban={handleUnban}
          user={user}
        />

        <UserSessionsList userId={user.id} />
      </div>

      <BanUserDialog
        onOpenChange={setShowBanDialog}
        open={showBanDialog}
        user={user}
      />
    </div>
  );
}
