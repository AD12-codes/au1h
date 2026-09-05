import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [query, setQuery] = useState("");
  const [applicationId, setApplicationId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [banUser, setBanUser] = useState<User | null>(null);

  const { data: usersData, isLoading } = useUsers({
    search: query || undefined,
    applicationId: applicationId === "all" ? undefined : applicationId,
    page,
    limit: 20,
  });

  const { data: applications } = useApplications();
  const unbanMutation = useUnbanUser();
  const revokeAllMutation = useRevokeAllSessions();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  };

  const total = usersData?.total ?? 0;

  return (
    <>
      <PageHeader
        description={
          isLoading
            ? "Loading…"
            : `${total} user${total === 1 ? "" : "s"} across your applications and workspace.`
        }
        title="Users"
      />

      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={handleSearch}
      >
        <div className="relative min-w-[240px] flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            value={search}
          />
        </div>
        <Select
          onValueChange={(value) => {
            setApplicationId(value);
            setPage(1);
          }}
          value={applicationId}
        >
          <SelectTrigger className="h-8 w-[200px] text-[13px]" size="sm">
            <SelectValue placeholder="All applications" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All applications</SelectItem>
            {applications?.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" type="submit" variant="outline">
          Search
        </Button>
      </form>

      {isLoading && <TableSkeleton rows={6} />}
      {!(isLoading || usersData?.users.length) && (
        <EmptyState
          description={
            query
              ? `Nothing matches "${query}".`
              : "Users appear here as soon as someone signs up in one of your applications."
          }
          icon={Users}
          title="No users found"
        />
      )}
      {!isLoading && usersData?.users.length ? (
        <>
          <UsersTable
            onBan={setBanUser}
            onRevokeSessions={(user) => revokeAllMutation.mutateAsync(user.id)}
            onUnban={(user) => unbanMutation.mutateAsync(user.id)}
            users={usersData.users}
          />
          <div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
            <p>
              Showing {(usersData.page - 1) * usersData.limit + 1}–
              {Math.min(usersData.page * usersData.limit, usersData.total)} of{" "}
              {usersData.total}
            </p>
            {usersData.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  size="icon-sm"
                  variant="outline"
                >
                  <ChevronLeft />
                </Button>
                <span className="px-2 tabular-nums">
                  {usersData.page} / {usersData.totalPages}
                </span>
                <Button
                  disabled={page >= usersData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  size="icon-sm"
                  variant="outline"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </>
      ) : null}

      <BanUserDialog
        onOpenChange={(open) => {
          if (!open) {
            setBanUser(null);
          }
        }}
        open={!!banUser}
        user={banUser}
      />
    </>
  );
}
