import { createFileRoute, redirect } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BanUserDialog } from "@/components/users/ban-user-dialog";
import { UsersTable } from "@/components/users/users-table";
import { useApplications } from "@/hooks/use-applications";
import {
  type User,
  useRevokeAllSessions,
  useUnbanUser,
  useUsers,
} from "@/hooks/use-users";
import { authClient } from "@/lib/auth-client";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export const Route = createFileRoute("/users/")({
  component: UsersPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
});

function UsersPage() {
  const [search, setSearch] = useState("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [banUser, setBanUser] = useState<User | null>(null);

  const { data: usersData, isLoading: usersLoading } = useUsers({
    search: search || undefined,
    applicationId: applicationId || undefined,
    page,
    limit: 20,
  });

  const { data: applications } = useApplications();
  const unbanMutation = useUnbanUser();
  const revokeAllMutation = useRevokeAllSessions();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleUnban = async (user: User) => {
    await unbanMutation.mutateAsync(user.id);
  };

  const handleRevokeSessions = async (user: User) => {
    await revokeAllMutation.mutateAsync(user.id);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="font-bold text-3xl tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          Manage users across all applications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {usersData?.total || 0} user{usersData?.total !== 1 && "s"} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="mb-6 flex gap-4" onSubmit={handleSearch}>
            <div className="relative flex-1">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                value={search}
              />
            </div>
            <Select
              onValueChange={(value) => {
                setApplicationId(value === "all" ? "" : value);
                setPage(1);
              }}
              value={applicationId}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Applications" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Applications</SelectItem>
                {applications?.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Search</Button>
          </form>

          {usersLoading && <LoadingSkeleton />}
          {!(usersLoading || usersData?.users.length) && (
            <div className="py-8 text-center text-muted-foreground">
              No users found
            </div>
          )}
          {!usersLoading && usersData?.users.length && (
            <>
              <UsersTable
                onBan={setBanUser}
                onRevokeSessions={handleRevokeSessions}
                onUnban={handleUnban}
                users={usersData.users}
              />

              {usersData.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Page {usersData.page} of {usersData.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      size="sm"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={page >= usersData.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      size="sm"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <BanUserDialog
        onOpenChange={(open) => {
          if (!open) {
            setBanUser(null);
          }
        }}
        open={!!banUser}
        user={banUser}
      />
    </div>
  );
}
