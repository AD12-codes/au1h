import { CopyButton } from "@/components/shared/copy-button";
import { Label } from "@/components/ui/label";

interface IntegrationSectionProps {
  applicationId: string;
  slug: string;
}

export function IntegrationSection({
  applicationId,
  slug,
}: IntegrationSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Integration</h3>
        <p className="text-muted-foreground text-sm">
          Use these values to integrate au1h with your application.
        </p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            Application ID
          </Label>
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
              {applicationId}
            </code>
            <CopyButton text={applicationId} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            x-app-id Header Value
          </Label>
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
              {slug}
            </code>
            <CopyButton text={slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
