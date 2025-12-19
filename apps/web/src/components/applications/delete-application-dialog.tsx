import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteApplication } from "@/hooks/use-applications";
import type { Application } from "@/lib/api";

interface DeleteApplicationDialogProps {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteApplicationDialog({
  application,
  open,
  onOpenChange,
}: DeleteApplicationDialogProps) {
  const deleteMutation = useDeleteApplication();

  const handleDelete = async () => {
    if (!application) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(application.id);
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Application</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{application?.name}"? This action
            cannot be undone. All users and sessions for this application will
            be deleted.
          </DialogDescription>
        </DialogHeader>
        {deleteMutation.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Failed to delete application"}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={deleteMutation.isPending}
            onClick={handleDelete}
            variant="destructive"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
