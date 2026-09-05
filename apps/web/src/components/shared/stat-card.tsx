import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between rounded-lg border bg-card px-4 py-3",
        className
      )}
    >
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
          {value}
        </p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {Icon && (
        <div className="rounded-md bg-muted p-1.5 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      )}
    </div>
  );
}
