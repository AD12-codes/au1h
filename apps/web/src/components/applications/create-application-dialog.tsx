import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useCreateApplication } from "@/hooks/use-applications";
import type { CreateApplicationInput } from "@/lib/api";

interface CreateApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialFormData: CreateApplicationInput = {
  name: "",
  slug: "",
  allowedOrigins: "",
  redirectUris: "",
};

export function CreateApplicationDialog({
  open,
  onOpenChange,
}: CreateApplicationDialogProps) {
  const [formData, setFormData] =
    useState<CreateApplicationInput>(initialFormData);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const createMutation = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { secret } = await createMutation.mutateAsync(formData);
      setCreatedSecret(secret);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setFormData(initialFormData);
    setCreatedSecret(null);
    setSlugManuallyEdited(false);
  };

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Show success state with secret
  if (createdSecret) {
    return (
      <Dialog onOpenChange={handleClose} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application Created!</DialogTitle>
            <DialogDescription>
              Save the secret below. You won't be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Application Name</Label>
              <p className="font-medium">{formData.name}</p>
            </div>
            <div className="space-y-1">
              <Label>Slug (use this as x-app-id)</Label>
              <code className="block rounded-md border bg-muted/50 px-3 py-2 font-mono text-[13px]">
                {formData.slug}
              </code>
            </div>
            <div className="space-y-1">
              <Label>Secret</Label>
              <code className="block break-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-[13px]">
                {createdSecret}
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Application</DialogTitle>
          <DialogDescription>
            Register a new application to use au1h authentication.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3.5" onSubmit={handleSubmit}>
          {createMutation.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create application"}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              onChange={(e) => {
                const name = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  name,
                  slug: slugManuallyEdited ? prev.slug : generateSlug(name),
                }));
              }}
              placeholder="My Todo App"
              required
              value={formData.name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              className="font-mono"
              id="slug"
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setFormData((prev) => ({ ...prev, slug: e.target.value }));
              }}
              pattern="^[a-z0-9-]+$"
              placeholder="my-todo-app"
              required
              title="Lowercase letters, numbers, and hyphens only"
              value={formData.slug}
            />
            <p className="text-muted-foreground text-xs">
              Used as the x-app-id header value
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allowedOrigins">Allowed Origins</Label>
            <Input
              id="allowedOrigins"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  allowedOrigins: e.target.value,
                }))
              }
              placeholder="http://localhost:3000,https://myapp.com"
              value={formData.allowedOrigins}
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated list of allowed CORS origins
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="redirectUris">Redirect URIs</Label>
            <Input
              id="redirectUris"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  redirectUris: e.target.value,
                }))
              }
              placeholder="http://localhost:3000/callback,https://myapp.com/callback"
              value={formData.redirectUris}
            />
            <p className="text-muted-foreground text-xs">
              Comma-separated list of valid OAuth redirect URIs
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={createMutation.isPending}
              onClick={handleClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
