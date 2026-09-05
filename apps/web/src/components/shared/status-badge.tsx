import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "muted" | "danger" | "warning" | "info";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  muted: "bg-muted-foreground/60",
  danger: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

/** A small badge with a status dot, for Active/Inactive/Banned style states. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge className={cn("gap-1.5 pl-1.5", className)} variant={tone}>
      <span className={cn("size-1.5 rounded-full", DOT[tone])} />
      {children}
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? "success" : "muted"}>
      {active ? "Active" : "Inactive"}
    </StatusBadge>
  );
}
