import Link from 'next/link';
import { gitConfig } from '@/lib/shared';

export function HomeFooter() {
  return (
    <footer className="border-t border-fd-border">
      <div className="mx-auto flex max-w-[1240px] items-center justify-center gap-2.5 px-4 py-6 text-[13px] text-fd-muted-foreground sm:px-8">
        <span className="font-mono text-fd-foreground">au1h</span>
        <span aria-hidden="true">·</span>
        <span>MIT</span>
        <span aria-hidden="true">·</span>
        <a href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`} className="hover:text-fd-foreground">
          GitHub
        </a>
        <span aria-hidden="true">·</span>
        <Link href="/docs" className="hover:text-fd-foreground">
          Docs
        </Link>
      </div>
    </footer>
  );
}
