import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1 text-[13px] shadow-xs outline-none transition-[color,box-shadow] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-xs placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
