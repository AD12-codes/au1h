import { cn } from "@/lib/utils";

/** The au1h shield: a line icon, never filled, stroked in the accent colour. */
export function ShieldIcon({
  className,
  strokeWidth = 1.5,
  style,
}: {
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      style={style}
      viewBox="0 0 24 24"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

/**
 * Wordmark: line shield in accent blue + "au1h" in the mono face.
 * `size` is the wordmark font size in px; the icon scales with it.
 */
export function Wordmark({
  size = 17,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const icon = Math.round(size * 1.06);
  return (
    <span
      className={cn("inline-flex items-center text-foreground", className)}
      style={{ gap: Math.round(size * 0.45) }}
    >
      <ShieldIcon
        className="shrink-0 text-primary"
        strokeWidth={size >= 30 ? 1.25 : 1.5}
        style={{ width: icon, height: icon }}
      />
      <span
        className="font-medium font-mono tracking-[-0.02em]"
        style={{ fontSize: size, lineHeight: 1 }}
      >
        au1h
      </span>
    </span>
  );
}
