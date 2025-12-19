import { CopyButton } from "@/components/shared/copy-button";
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

interface SecretDialogProps {
  secret: string | null;
  onClose: () => void;
}

export function SecretDialog({ secret, onClose }: SecretDialogProps) {
  return (
    <Dialog onOpenChange={onClose} open={!!secret}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Secret Generated</DialogTitle>
          <DialogDescription>
            Save this secret now. You won't be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Secret</Label>
          <div className="flex gap-2">
            <Input className="font-mono" readOnly value={secret || ""} />
            <CopyButton text={secret || ""} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
