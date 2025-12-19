import { formatDistanceToNow } from "date-fns";
import { Monitor, Smartphone, Trash2 } from "lucide-react";
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
  type Session,
  useRevokeAllSessions,
  useRevokeSession,
  useUserSessions,
} from "@/hooks/use-users";

const MOBILE_REGEX = /mobile|android|iphone|ipad/i;

interface UserSessionsListProps {
  userId: string;
}

function parseUserAgent(ua: string | null): {
  device: string;
  browser: string;
} {
  if (!ua) {
    return { device: "Unknown", browser: "Unknown" };
  }

  const isMobile = MOBILE_REGEX.test(ua);
  const device = isMobile ? "Mobile" : "Desktop";

  let browser = "Unknown";
  if (ua.includes("Chrome")) {
    browser = "Chrome";
  } else if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Safari")) {
    browser = "Safari";
  } else if (ua.includes("Edge")) {
    browser = "Edge";
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
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        {device === "Mobile" ? (
          <Smartphone className="size-5 text-muted-foreground" />
        ) : (
          <Monitor className="size-5 text-muted-foreground" />
        )}
        <div>
          <div className="font-medium">
            {browser} on {device}
          </div>
          <div className="text-muted-foreground text-sm">
            {session.ipAddress || "Unknown IP"} •{" "}
            {formatDistanceToNow(new Date(session.createdAt), {
              addSuffix: true,
            })}
          </div>
          {isExpired && (
            <span className="text-destructive text-xs">Expired</span>
          )}
        </div>
      </div>
      <Button
        disabled={revokeSession.isPending}
        onClick={() => revokeSession.mutate({ sessionId: session.id, userId })}
        size="icon"
        variant="ghost"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function UserSessionsList({ userId }: UserSessionsListProps) {
  const { data, isLoading } = useUserSessions(userId);
  const revokeAllSessions = useRevokeAllSessions();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            {sessions.length} active session{sessions.length !== 1 && "s"}
          </CardDescription>
        </div>
        {sessions.length > 0 && (
          <Button
            disabled={revokeAllSessions.isPending}
            onClick={() => revokeAllSessions.mutate(userId)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="mr-2 size-4" />
            Revoke All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            No active sessions
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionItem key={session.id} session={session} userId={userId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
