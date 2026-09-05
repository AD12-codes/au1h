import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  AppRoute,
  CreateRouteInput,
  UpdateRouteInput,
} from "@/hooks/use-routes";
import { useCreateRoute, useUpdateRoute } from "@/hooks/use-routes";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function SubmitButtonText({
  isLoading,
  isEditing,
}: {
  isLoading: boolean;
  isEditing: boolean;
}) {
  if (isLoading) {
    return isEditing ? "Saving..." : "Creating...";
  }
  return isEditing ? "Save Changes" : "Create Route";
}

interface RouteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  route?: AppRoute | null;
}

export function RouteFormDialog({
  open,
  onOpenChange,
  applicationId,
  route,
}: RouteFormDialogProps) {
  const isEditing = !!route;

  const [name, setName] = useState("");
  const [pathPattern, setPathPattern] = useState("");
  const [backendUrl, setBackendUrl] = useState("");
  const [methods, setMethods] = useState<string[]>(["GET"]);
  const [stripPrefix, setStripPrefix] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateRoute();
  const updateMutation = useUpdateRoute();

  useEffect(() => {
    if (route) {
      setName(route.name);
      setPathPattern(route.pathPattern);
      setBackendUrl(route.backendUrl);
      setMethods(route.methods);
      setStripPrefix(route.stripPrefix);
    } else {
      setName("");
      setPathPattern("");
      setBackendUrl("");
      setMethods(["GET"]);
      setStripPrefix(true);
    }
    setError(null);
  }, [route]);

  const handleMethodToggle = (method: string) => {
    setMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!pathPattern.trim()) {
      setError("Path pattern is required");
      return;
    }
    if (!backendUrl.trim()) {
      setError("Backend URL is required");
      return;
    }
    if (methods.length === 0) {
      setError("At least one HTTP method is required");
      return;
    }

    try {
      if (isEditing && route) {
        const input: UpdateRouteInput = {
          name: name.trim(),
          pathPattern: pathPattern.trim(),
          backendUrl: backendUrl.trim(),
          methods,
          stripPrefix,
        };
        await updateMutation.mutateAsync({ id: route.id, input });
      } else {
        const input: CreateRouteInput = {
          applicationId,
          name: name.trim(),
          pathPattern: pathPattern.trim(),
          backendUrl: backendUrl.trim(),
          methods,
          stripPrefix,
        };
        await createMutation.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Route" : "Add Proxy Route"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the proxy route configuration."
                : "Configure a new proxy route to forward requests to your backend."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Route Name</Label>
              <Input
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Todo API"
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pathPattern">Path Pattern</Label>
              <Input
                id="pathPattern"
                onChange={(e) => setPathPattern(e.target.value)}
                placeholder="e.g., /todos/*"
                value={pathPattern}
              />
              <p className="text-muted-foreground text-xs">
                Use * for wildcards, :param for path parameters
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="backendUrl">Backend URL</Label>
              <Input
                id="backendUrl"
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g., http://todo-api:8080"
                value={backendUrl}
              />
            </div>

            <div className="grid gap-2">
              <Label>HTTP Methods</Label>
              <div className="flex flex-wrap gap-4">
                {HTTP_METHODS.map((method) => (
                  <div className="flex items-center space-x-2" key={method}>
                    <Checkbox
                      checked={methods.includes(method)}
                      id={`method-${method}`}
                      onCheckedChange={() => handleMethodToggle(method)}
                    />
                    <Label
                      className="cursor-pointer font-normal text-sm"
                      htmlFor={`method-${method}`}
                    >
                      {method}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="stripPrefix">Strip Path Prefix</Label>
                <p className="text-muted-foreground text-xs">
                  Remove the matched path prefix before forwarding
                </p>
              </div>
              <Switch
                checked={stripPrefix}
                id="stripPrefix"
                onCheckedChange={setStripPrefix}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isLoading} type="submit">
              <SubmitButtonText isEditing={isEditing} isLoading={isLoading} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
