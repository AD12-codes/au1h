import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { UpdateApplicationInput } from "@/lib/api";

interface SettingsFormProps {
  formData: UpdateApplicationInput;
  onChange: (data: UpdateApplicationInput) => void;
  isSystemApp: boolean;
  isLoading: boolean;
  error: string | null;
  success: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function SettingsForm({
  formData,
  onChange,
  isSystemApp,
  isLoading,
  error,
  success,
  onSubmit,
}: SettingsFormProps) {
  const updateField = <K extends keyof UpdateApplicationInput>(
    field: K,
    value: UpdateApplicationInput[K]
  ) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-success">
          Saved.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            onChange={(e) => updateField("name", e.target.value)}
            required
            value={formData.name}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            className="font-mono"
            disabled={isSystemApp}
            id="slug"
            onChange={(e) => updateField("slug", e.target.value)}
            pattern="^[a-z0-9-]+$"
            required
            title="Lowercase letters, numbers, and hyphens only"
            value={formData.slug}
          />
          {isSystemApp && (
            <p className="text-muted-foreground text-xs">
              System app slug cannot be changed
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="allowedOrigins">Allowed Origins</Label>
        <Input
          className="font-mono"
          id="allowedOrigins"
          onChange={(e) => updateField("allowedOrigins", e.target.value)}
          placeholder="http://localhost:3000, https://myapp.com"
          value={formData.allowedOrigins || ""}
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated list of allowed CORS origins
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="redirectUris">Redirect URIs</Label>
        <Input
          className="font-mono"
          id="redirectUris"
          onChange={(e) => updateField("redirectUris", e.target.value)}
          placeholder="http://localhost:3000/callback"
          value={formData.redirectUris || ""}
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated list of valid OAuth redirect URIs
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logo">Logo URL</Label>
        <Input
          id="logo"
          onChange={(e) => updateField("logo", e.target.value || null)}
          placeholder="https://example.com/logo.png"
          type="url"
          value={formData.logo || ""}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
          <Label htmlFor="isActive">Active</Label>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {isSystemApp
              ? "System app cannot be deactivated"
              : "Inactive applications reject every sign-in and token."}
          </p>
        </div>
        <Switch
          checked={!!formData.isActive}
          disabled={isSystemApp}
          id="isActive"
          onCheckedChange={(checked) => updateField("isActive", checked)}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={isLoading} size="sm" type="submit">
          <Save />
          {isLoading ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
