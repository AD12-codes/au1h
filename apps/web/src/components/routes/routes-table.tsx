import {
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Route,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Mono } from "@/components/shared/mono";
import { ActiveBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { AppRoute } from "@/hooks/use-routes";
import { useDeleteRoute, useToggleRoute } from "@/hooks/use-routes";
import { cn } from "@/lib/utils";

interface RoutesTableProps {
  routes: AppRoute[];
  onEdit: (route: AppRoute) => void;
  onAdd?: () => void;
}

const METHOD_COLOR: Record<string, string> = {
  GET: "text-success",
  POST: "text-info",
  PUT: "text-warning",
  PATCH: "text-warning",
  DELETE: "text-destructive",
  HEAD: "text-muted-foreground",
  OPTIONS: "text-muted-foreground",
};

function Method({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "font-medium font-mono text-[11px]",
        METHOD_COLOR[method] ?? "text-muted-foreground"
      )}
    >
      {method}
    </span>
  );
}

export function RoutesTable({ routes, onEdit, onAdd }: RoutesTableProps) {
  const [deleteRoute, setDeleteRoute] = useState<AppRoute | null>(null);
  const deleteMutation = useDeleteRoute();
  const toggleMutation = useToggleRoute();

  const handleDelete = async () => {
    if (!deleteRoute) {
      return;
    }
    await deleteMutation.mutateAsync(deleteRoute.id);
    setDeleteRoute(null);
  };

  const handleToggle = (route: AppRoute) =>
    toggleMutation.mutateAsync({ id: route.id, isActive: !route.isActive });

  if (routes.length === 0) {
    return (
      <EmptyState
        action={
          onAdd && (
            <Button onClick={onAdd} size="sm" variant="outline">
              <Plus /> Add route
            </Button>
          )
        }
        description="Map a path pattern like /todos/* to your backend URL. au1h authenticates the caller and forwards the request with trusted user headers."
        icon={Route}
        title="No proxy routes"
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Pattern</TableHead>
            <TableHead>Backend</TableHead>
            <TableHead>Methods</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.map((route) => (
            <TableRow key={route.id}>
              <TableCell className="font-medium">{route.name}</TableCell>
              <TableCell>
                <Mono>{route.pathPattern}</Mono>
                {!route.stripPrefix && (
                  <span
                    className="ml-1.5 text-muted-foreground text-xs"
                    title="The matched prefix is kept when forwarding"
                  >
                    keep prefix
                  </span>
                )}
              </TableCell>
              <TableCell
                className="max-w-[240px] truncate font-mono text-muted-foreground text-xs"
                title={route.backendUrl}
              >
                {route.backendUrl}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {route.methods.map((method) => (
                    <Method key={method} method={method} />
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <ActiveBadge active={route.isActive} />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(route)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggle(route)}>
                      {route.isActive ? (
                        <>
                          <Pause /> Disable
                        </>
                      ) : (
                        <>
                          <Play /> Enable
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteRoute(route)}
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

      <AlertDialog
        onOpenChange={() => setDeleteRoute(null)}
        open={!!deleteRoute}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleteRoute?.name}"? Requests to{" "}
              <Mono>{deleteRoute?.pathPattern}</Mono> will start returning 404.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
