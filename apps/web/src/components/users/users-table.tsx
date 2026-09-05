import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Ban, Eye, MoreHorizontal, ShieldOff, Trash2 } from "lucide-react";
import { Mono } from "@/components/shared/mono";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { User } from "@/hooks/use-users";

interface UsersTableProps {
  users: User[];
  onBan: (user: User) => void;
  onUnban: (user: User) => void;
  onRevokeSessions: (user: User) => void;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserStatusBadge({ user }: { user: User }) {
  if (user.banned) {
    return <StatusBadge tone="danger">Banned</StatusBadge>;
  }
  if (user.emailVerified) {
    return <StatusBadge tone="success">Verified</StatusBadge>;
  }
  return <StatusBadge tone="muted">Unverified</StatusBadge>;
}

export function UsersTable({
  users,
  onBan,
  onUnban,
  onRevokeSessions,
}: UsersTableProps) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Application</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow
            className="cursor-pointer"
            key={user.id}
            onClick={() =>
              navigate({ to: "/users/$id", params: { id: user.id } })
            }
          >
            <TableCell>
              <div className="flex items-center gap-2.5">
                <Avatar className="size-7">
                  <AvatarImage alt="" src={user.image || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 leading-tight">
                  <Link
                    className="block truncate font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                    params={{ id: user.id }}
                    to="/users/$id"
                  >
                    {user.name}
                  </Link>
                  <span className="block truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              {user.applicationSlug ? (
                <Mono>{user.applicationSlug}</Mono>
              ) : (
                <span className="text-muted-foreground text-xs">
                  admin portal
                </span>
              )}
            </TableCell>
            <TableCell>
              <UserStatusBadge user={user} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {user.sessionCount}
            </TableCell>
            <TableCell
              className="text-muted-foreground"
              title={new Date(user.createdAt).toLocaleString()}
            >
              {format(new Date(user.createdAt), "MMM d, yyyy")}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link params={{ id: user.id }} to="/users/$id">
                      <Eye /> View details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user.banned ? (
                    <DropdownMenuItem onClick={() => onUnban(user)}>
                      <ShieldOff /> Unban user
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => onBan(user)}
                      variant="destructive"
                    >
                      <Ban /> Ban user
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={user.sessionCount === 0}
                    onClick={() => onRevokeSessions(user)}
                  >
                    <Trash2 /> Revoke all sessions
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
