import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-3 rounded-md border bg-muted/50 p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      )}
      <p className="font-medium text-sm">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-muted-foreground text-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
