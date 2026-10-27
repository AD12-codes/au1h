import type { CSSProperties } from 'react';

/** The au1h shield: a line icon, never filled, stroked in the accent blue. */
export function ShieldIcon({
  size = 18,
  strokeWidth = 1.5,
  className,
  style,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2F80FF"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

/** Line shield + "au1h" in the mono face. `size` is the text size in px. */
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center text-fd-foreground"
      style={{ gap: Math.round(size * 0.45) }}
    >
      <ShieldIcon size={Math.round(size * 1.06)} strokeWidth={size >= 30 ? 1.25 : 1.5} />
      <span
        className="font-mono font-medium"
        style={{ fontSize: size, lineHeight: 1, letterSpacing: '-0.02em' }}
      >
        au1h
      </span>
    </span>
  );
}
