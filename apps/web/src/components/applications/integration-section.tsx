import { CopyField } from "@/components/shared/copy-field";
import { SERVER_URL } from "@/lib/config";

interface IntegrationSectionProps {
  applicationId: string;
  slug: string;
}

const AU1H_URL = SERVER_URL;

export function IntegrationSection({
  applicationId,
  slug,
}: IntegrationSectionProps) {
  return (
    <div className="space-y-3">
      <CopyField
        hint="Send this as the x-app-id header; it is also the JWT aud."
        label="Slug"
        value={slug}
      />
      <CopyField label="Application id" value={applicationId} />
      <CopyField label="Auth base URL" value={`${AU1H_URL}/api/auth`} />
      <CopyField label="JWKS" value={`${AU1H_URL}/api/auth/jwks`} />
    </div>
  );
}
