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
import { type User, useBanUser } from "@/hooks/use-users";

interface BanUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BanUserDialog({
  user,
  open,
  onOpenChange,
}: BanUserDialogProps) {
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const banMutation = useBanUser();

  const handleBan = async () => {
    if (!user) {
      return;
    }

    try {
      await banMutation.mutateAsync({
        id: user.id,
        reason: reason || undefined,
        expiresAt: expiresAt || undefined,
      });
      onOpenChange(false);
      setReason("");
      setExpiresAt("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setReason("");
    setExpiresAt("");
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban User</DialogTitle>
          <DialogDescription>
            Ban {user?.name} ({user?.email}) from {user?.applicationName}. They
            will not be able to log in until unbanned.
          </DialogDescription>
        </DialogHeader>

        {banMutation.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
            {banMutation.error instanceof Error
              ? banMutation.error.message
              : "Failed to ban user"}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder="Violation of terms of service"
              value={reason}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Ban Expires (optional)</Label>
            <Input
              id="expiresAt"
              onChange={(e) => setExpiresAt(e.target.value)}
              type="datetime-local"
              value={expiresAt}
            />
            <p className="text-muted-foreground text-xs">
              Leave empty for permanent ban
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={banMutation.isPending}
            onClick={handleBan}
            variant="destructive"
          >
            {banMutation.isPending ? "Banning..." : "Ban User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
