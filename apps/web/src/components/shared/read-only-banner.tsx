import { Info } from "lucide-react";
import {
  READ_ONLY_MESSAGE,
  useWorkspaceRole,
} from "@/hooks/use-workspace-role";

export function ReadOnlyBanner() {
  const { isReadOnly } = useWorkspaceRole();

  if (!isReadOnly) {
    return null;
  }

  return (
    <aside className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-500">
      <Info className="size-4 shrink-0" />
      <span>{READ_ONLY_MESSAGE}</span>
    </aside>
  );
}
