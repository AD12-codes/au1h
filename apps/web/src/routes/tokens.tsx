import { createFileRoute, redirect } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CopyField } from "@/components/shared/copy-field";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading";
import { Mono } from "@/components/shared/mono";
import { PageHeader } from "@/components/shared/page-header";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateToken, useRevokeToken, useTokens } from "@/hooks/use-tokens";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/tokens")({
  component: TokensPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
  },
});

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "No expiry" },
];

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [secret, setSecret] = useState<string | null>(null);
  const createMutation = useCreateToken();

  const close = () => {
    onOpenChange(false);
    setName("");
    setExpiry("90");
    setSecret(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        expiresInDays: expiry === "never" ? undefined : Number(expiry),
      });
      setSecret(result.secret);
    } catch {
      // Error handled by mutation
    }
  };

  if (secret) {
    return (
      <Dialog onOpenChange={close} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Copy it now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <CopyField label={name} value={secret} />
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
            {`curl -H "Authorization: Bearer <token>" ${SERVER_URL}/api/v1/applications`}
          </pre>
          <DialogFooter>
            <Button onClick={close} size="sm">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New API token</DialogTitle>
            <DialogDescription>
              Grants the same access as your session to this workspace's admin
              API. Keep it secret.
            </DialogDescription>
          </DialogHeader>
          {createMutation.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {createMutation.error.message}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI deploy, laptop CLI"
              required
              value={name}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expires</Label>
            <Select onValueChange={setExpiry} value={expiry}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={close} size="sm" type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} size="sm" type="submit">
              {createMutation.isPending ? "Creating…" : "Create token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TokensPage() {
  const { data: tokens, isLoading } = useTokens();
  const revokeMutation = useRevokeToken();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus /> New token
          </Button>
        }
        description="Personal access tokens for the admin API and the au1h CLI. Each token is bound to this workspace."
        title="API tokens"
      />

      {isLoading && <TableSkeleton rows={3} />}
      {!(isLoading || tokens?.length) && (
        <EmptyState
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus /> New token
            </Button>
          }
          description="Use a token as `Authorization: Bearer au1h_pat_…` against /api/v1, or with `au1h login`."
          icon={KeyRound}
          title="No API tokens"
        />
      )}
      {!isLoading && tokens?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <Mono>{t.prefix}…</Mono>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.lastUsedAt
                    ? formatDistanceToNowStrict(new Date(t.lastUsedAt), {
                        addSuffix: true,
                      })
                    : "never"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.expiresAt
                    ? format(new Date(t.expiresAt), "MMM d, yyyy")
                    : "never"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(t.createdAt), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Button
                    aria-label="Revoke token"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(t.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <CreateTokenDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}
