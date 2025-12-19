import { Link } from "@tanstack/react-router";
import { Ban, Eye, MoreHorizontal, ShieldOff, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

function UserStatusBadge({ user }: { user: User }) {
  if (user.banned) {
    return <Badge variant="destructive">Banned</Badge>;
  }
  if (user.emailVerified) {
    return <Badge variant="default">Verified</Badge>;
  }
  return <Badge variant="secondary">Unverified</Badge>;
}

export function UsersTable({
  users,
  onBan,
  onUnban,
  onRevokeSessions,
}: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Application</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sessions</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarImage alt={user.name} src={user.image || undefined} />
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-muted-foreground text-sm">
                    {user.email}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{user.applicationName}</Badge>
            </TableCell>
            <TableCell>
              <UserStatusBadge user={user} />
            </TableCell>
            <TableCell>{user.sessionCount}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(user.createdAt)}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link params={{ id: user.id }} to="/users/$id">
                      <Eye className="mr-2 size-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user.banned ? (
                    <DropdownMenuItem onClick={() => onUnban(user)}>
                      <ShieldOff className="mr-2 size-4" />
                      Unban User
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onBan(user)}
                    >
                      <Ban className="mr-2 size-4" />
                      Ban User
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={user.sessionCount === 0}
                    onClick={() => onRevokeSessions(user)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Revoke All Sessions
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
