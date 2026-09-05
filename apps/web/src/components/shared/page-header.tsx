import type * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small line above the title, e.g. a breadcrumb or back link. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-end justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {eyebrow}
          </div>
        )}
        <h1 className="flex items-center gap-2 truncate font-semibold text-xl tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
