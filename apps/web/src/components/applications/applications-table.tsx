import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Key,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Mono } from "@/components/shared/mono";
import { ActiveBadge } from "@/components/shared/status-badge";
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
import type { Application } from "@/lib/api";

interface ApplicationsTableProps {
  applications: Application[];
  onDelete: (app: Application) => void;
  onRegenerateSecret: (app: Application) => void;
}

export function ApplicationsTable({
  applications,
  onDelete,
  onRegenerateSecret,
}: ApplicationsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Application</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Users</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((app) => (
          <TableRow
            className="cursor-pointer"
            key={app.id}
            onClick={() =>
              navigate({ to: "/applications/$id", params: { id: app.id } })
            }
          >
            <TableCell className="font-medium">
              <div className="flex items-center gap-2.5">
                {app.logo ? (
                  <img
                    alt=""
                    className="size-6 rounded"
                    height={24}
                    src={app.logo}
                    width={24}
                  />
                ) : (
                  <span className="grid size-6 place-items-center rounded border bg-muted text-muted-foreground">
                    <Key className="size-3" />
                  </span>
                )}
                <Link
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  params={{ id: app.id }}
                  to="/applications/$id"
                >
                  {app.name}
                </Link>
              </div>
            </TableCell>
            <TableCell>
              <Mono>{app.slug}</Mono>
            </TableCell>
            <TableCell>
              <ActiveBadge active={app.isActive} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {app.userCount ?? 0}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {app.sessionCount ?? 0}
            </TableCell>
            <TableCell
              className="text-muted-foreground"
              title={new Date(app.createdAt).toLocaleString()}
            >
              {format(new Date(app.createdAt), "MMM d, yyyy")}
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
                  <DropdownMenuItem
                    onClick={() => handleCopy(app.slug, `slug-${app.id}`)}
                  >
                    {copiedId === `slug-${app.id}` ? <Check /> : <Copy />}
                    Copy slug
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCopy(app.id, `id-${app.id}`)}
                  >
                    {copiedId === `id-${app.id}` ? <Check /> : <Copy />}
                    Copy application id
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link params={{ id: app.id }} to="/applications/$id">
                      <Pencil /> Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRegenerateSecret(app)}>
                    <RefreshCw /> Regenerate secret
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(app)}
                    variant="destructive"
                  >
                    <Trash2 /> Delete
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
