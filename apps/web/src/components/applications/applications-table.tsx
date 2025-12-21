import { Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Key,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
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

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isSystemApp = (app: Application) => {
    try {
      return app.metadata && JSON.parse(app.metadata).isSystemApp;
    } catch {
      return false;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Users</TableHead>
          <TableHead>Sessions</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((app) => (
          <TableRow key={app.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {app.logo ? (
                  <img
                    alt={app.name}
                    className="size-8 rounded"
                    height={32}
                    src={app.logo}
                    width={32}
                  />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded bg-muted">
                    <Key className="size-4 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <div>{app.name}</div>
                  {isSystemApp(app) && (
                    <Badge className="text-xs" variant="secondary">
                      System
                    </Badge>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <code className="rounded bg-muted px-2 py-1 text-sm">
                {app.slug}
              </code>
            </TableCell>
            <TableCell>
              <Badge variant={app.isActive ? "default" : "secondary"}>
                {app.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Users className="size-4 text-muted-foreground" />
                {app.userCount || 0}
              </div>
            </TableCell>
            <TableCell>{app.sessionCount || 0}</TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(app.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleCopy(app.id, `id-${app.id}`)}
                  >
                    {copiedId === `id-${app.id}` ? (
                      <Check className="mr-2 size-4" />
                    ) : (
                      <Copy className="mr-2 size-4" />
                    )}
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCopy(app.slug, `slug-${app.id}`)}
                  >
                    {copiedId === `slug-${app.id}` ? (
                      <Check className="mr-2 size-4" />
                    ) : (
                      <Copy className="mr-2 size-4" />
                    )}
                    Copy Slug
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link params={{ id: app.id }} to="/applications/$id">
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRegenerateSecret(app)}>
                    <RefreshCw className="mr-2 size-4" />
                    Regenerate Secret
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(app)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
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
