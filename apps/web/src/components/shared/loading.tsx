import { Skeleton } from "@/components/ui/skeleton";

const ROW_IDS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="h-9 border-b bg-muted/40" />
      {ROW_IDS.slice(0, rows).map((id) => (
        <div
          className="flex items-center gap-4 border-b px-3 py-2.5 last:border-0"
          key={id}
        >
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}
