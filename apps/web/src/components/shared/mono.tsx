import { cn } from "@/lib/utils";

/** Inline identifier chip (slugs, ids, paths) in monospace. */
export function Mono({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-[4px] border bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-foreground/90",
        className
      )}
      title={title}
    >
      {children}
    </code>
  );
}
