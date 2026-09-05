import { formatDistanceToNow } from "date-fns";
import { Monitor, Smartphone, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Session,
  useRevokeAllSessions,
  useRevokeSession,
  useUserSessions,
} from "@/hooks/use-users";

const MOBILE_REGEX = /mobile|android|iphone|ipad/i;

function parseUserAgent(ua: string | null): {
  device: string;
  browser: string;
} {
  if (!ua) {
    return { device: "Unknown device", browser: "Unknown client" };
  }
  const device = MOBILE_REGEX.test(ua) ? "Mobile" : "Desktop";
  let browser = "Unknown client";
  if (ua.includes("Edg")) {
    browser = "Edge";
  } else if (ua.includes("Chrome")) {
    browser = "Chrome";
  } else if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Safari")) {
    browser = "Safari";
  } else if (ua.includes("curl")) {
    browser = "curl";
  }
  return { device, browser };
}

function SessionItem({
  session,
  userId,
}: {
  session: Session;
  userId: string;
}) {
  const revokeSession = useRevokeSession();
  const { device, browser } = parseUserAgent(session.userAgent);
  const isExpired = new Date(session.expiresAt) < new Date();

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
          {device === "Mobile" ? (
            <Smartphone className="size-3.5" />
          ) : (
            <Monitor className="size-3.5" />
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-medium text-[13px]">
            {browser} · {device}
            {isExpired && (
              <Badge className="ml-2" variant="muted">
                Expired
              </Badge>
            )}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            <span className="font-mono">
              {session.ipAddress || "unknown ip"}
            </span>
            {" · "}
            started{" "}
            {formatDistanceToNow(new Date(session.createdAt), {
              addSuffix: true,
            })}
            {" · "}
            expires{" "}
            {formatDistanceToNow(new Date(session.expiresAt), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>
      <Button
        aria-label="Revoke session"
        className="text-muted-foreground hover:text-destructive"
        disabled={revokeSession.isPending}
        onClick={() => revokeSession.mutate({ sessionId: session.id, userId })}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2 />
      </Button>
    </li>
  );
}

export function UserSessionsList({ userId }: { userId: string }) {
  const { data, isLoading } = useUserSessions(userId);
  const revokeAllSessions = useRevokeAllSessions();
  const sessions = data?.sessions ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading…"
            : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
        </CardDescription>
        {sessions.length > 0 && (
          <CardAction>
            <Button
              disabled={revokeAllSessions.isPending}
              onClick={() => revokeAllSessions.mutate(userId)}
              size="sm"
              variant="outline"
            >
              <Trash2 /> Revoke all
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {isLoading && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {!isLoading && sessions.length === 0 && (
          <EmptyState
            className="m-4"
            description="The user is signed out everywhere."
            title="No sessions"
          />
        )}
        {!isLoading && sessions.length > 0 && (
          <ul className="divide-y">
            {sessions.map((session) => (
              <SessionItem key={session.id} session={session} userId={userId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
