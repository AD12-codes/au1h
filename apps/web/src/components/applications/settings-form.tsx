import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <form className="space-y-6" onSubmit={onSubmit}>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 p-3 text-green-600 text-sm">
          Application updated successfully!
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          onChange={(e) => updateField("name", e.target.value)}
          required
          value={formData.name}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
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

      <div className="space-y-2">
        <Label htmlFor="allowedOrigins">Allowed Origins</Label>
        <Input
          id="allowedOrigins"
          onChange={(e) => updateField("allowedOrigins", e.target.value)}
          placeholder="http://localhost:3000,https://myapp.com"
          value={formData.allowedOrigins || ""}
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated list of allowed CORS origins
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="redirectUris">Redirect URIs</Label>
        <Input
          id="redirectUris"
          onChange={(e) => updateField("redirectUris", e.target.value)}
          placeholder="http://localhost:3000/callback"
          value={formData.redirectUris || ""}
        />
        <p className="text-muted-foreground text-xs">
          Comma-separated list of valid OAuth redirect URIs
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo">Logo URL</Label>
        <Input
          id="logo"
          onChange={(e) => updateField("logo", e.target.value || null)}
          placeholder="https://example.com/logo.png"
          type="url"
          value={formData.logo || ""}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          checked={formData.isActive}
          className="size-4"
          disabled={isSystemApp}
          id="isActive"
          onChange={(e) => updateField("isActive", e.target.checked)}
          type="checkbox"
        />
        <Label htmlFor="isActive">Active</Label>
        {isSystemApp && (
          <span className="text-muted-foreground text-xs">
            (System app cannot be deactivated)
          </span>
        )}
      </div>

      <Button disabled={isLoading} type="submit">
        {isLoading ? (
          "Saving..."
        ) : (
          <>
            <Save className="mr-2 size-4" />
            Save Changes
          </>
        )}
      </Button>
    </form>
  );
}
