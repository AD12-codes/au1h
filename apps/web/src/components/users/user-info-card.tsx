import { Mono } from "@/components/shared/mono";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { User } from "@/hooks/use-users";
import { getInitials } from "./users-table";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export function UserInfoCard({ user }: { user: User }) {
  return (
    <Card className="self-start">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage alt="" src={user.image || undefined} />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-muted-foreground text-xs">
              {user.email}
            </p>
          </div>
        </div>

        <dl className="divide-y">
          <Row label="User id">
            <Mono className="break-all">{user.id}</Mono>
          </Row>
          <Row label="Application">
            {user.applicationSlug ? (
              <Mono>{user.applicationSlug}</Mono>
            ) : (
              <span className="text-muted-foreground">admin portal</span>
            )}
          </Row>
          <Row label="Role">{user.role || "—"}</Row>
          <Row label="Email verified">{user.emailVerified ? "Yes" : "No"}</Row>
          <Row label="Sessions">{user.sessionCount}</Row>
          <Row label="Joined">{formatDate(user.createdAt)}</Row>
          {user.banned && (
            <Row label="Ban reason">
              <span className="text-destructive">
                {user.banReason || "No reason given"}
              </span>
            </Row>
          )}
          {user.banned && user.banExpires && (
            <Row label="Ban expires">{formatDate(user.banExpires)}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
