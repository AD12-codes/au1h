import { CopyButton } from "@/components/shared/copy-button";

/** Label + monospace value + copy button, for ids, slugs and secrets. */
export function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="flex items-center gap-1 rounded-md border bg-muted/40 pr-1 pl-2.5">
        <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-[12px]">
          {value}
        </code>
        <CopyButton text={value} />
      </div>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
