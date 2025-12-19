import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
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
import type { AppRoute } from "@/hooks/use-routes";
import { useDeleteRoute, useToggleRoute } from "@/hooks/use-routes";

interface RoutesTableProps {
  routes: AppRoute[];
  onEdit: (route: AppRoute) => void;
}

export function RoutesTable({ routes, onEdit }: RoutesTableProps) {
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

  const handleToggle = async (route: AppRoute) => {
    await toggleMutation.mutateAsync({
      id: route.id,
      isActive: !route.isActive,
    });
  };

  if (routes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No proxy routes configured yet.</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Add a route to start proxying requests to your backend services.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Path Pattern</TableHead>
              <TableHead>Backend URL</TableHead>
              <TableHead>Methods</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-medium">{route.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                    {route.pathPattern}
                  </code>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                  {route.backendUrl}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {route.methods.map((method) => (
                      <MethodBadge key={method} method={method} />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={route.isActive ? "default" : "secondary"}>
                    {route.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="size-8" size="icon" variant="ghost">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(route)}>
                        <Pencil className="mr-2 size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggle(route)}>
                        {route.isActive ? (
                          <>
                            <Pause className="mr-2 size-4" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 size-4" />
                            Enable
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteRoute(route)}
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
      </div>

      <AlertDialog
        onOpenChange={() => setDeleteRoute(null)}
        open={!!deleteRoute}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the route "{deleteRoute?.name}"?
              This action cannot be undone.
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

function MethodBadge({ method }: { method: string }) {
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    GET: "outline",
    POST: "default",
    PUT: "secondary",
    PATCH: "secondary",
    DELETE: "destructive" as "default",
  };

  return (
    <Badge className="text-xs" variant={variants[method] || "outline"}>
      {method}
    </Badge>
  );
}
