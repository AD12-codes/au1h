import { Ban, Mail, ShieldOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { User } from "@/hooks/use-users";

interface UserInfoCardProps {
  user: User;
  onBan: () => void;
  onUnban: () => void;
  isBanning?: boolean;
  isUnbanning?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function UserInfoCard({
  user,
  onBan,
  onUnban,
  isBanning,
  isUnbanning,
}: UserInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage alt={user.name} src={user.image || undefined} />
              <AvatarFallback className="text-lg">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{user.name}</CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Mail className="size-4" />
                {user.email}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.banned ? (
              <>
                <Badge variant="destructive">Banned</Badge>
                <Button
                  disabled={isUnbanning}
                  onClick={onUnban}
                  size="sm"
                  variant="outline"
                >
                  <ShieldOff className="mr-2 size-4" />
                  {isUnbanning ? "Unbanning..." : "Unban"}
                </Button>
              </>
            ) : (
              <>
                {user.emailVerified ? (
                  <Badge variant="default">Verified</Badge>
                ) : (
                  <Badge variant="secondary">Unverified</Badge>
                )}
                <Button
                  disabled={isBanning}
                  onClick={onBan}
                  size="sm"
                  variant="outline"
                >
                  <Ban className="mr-2 size-4" />
                  Ban
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-sm">Application</p>
            <p className="font-medium">{user.applicationName}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Role</p>
            <p className="font-medium">{user.role || "None"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Joined</p>
            <p className="font-medium">{formatDate(user.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Active Sessions</p>
            <p className="font-medium">{user.sessionCount}</p>
          </div>
          {user.banned && user.banReason && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-sm">Ban Reason</p>
              <p className="font-medium text-destructive">{user.banReason}</p>
            </div>
          )}
          {user.banned && user.banExpires && (
            <div>
              <p className="text-muted-foreground text-sm">Ban Expires</p>
              <p className="font-medium">{formatDate(user.banExpires)}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
