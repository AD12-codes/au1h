import Link from 'next/link';
import { gitConfig } from '@/lib/shared';

const REPO = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export function HomeFooter() {
  return (
    <footer className="relative">
      <div className="mx-auto flex max-w-[1240px] items-center justify-center gap-2.5 px-4 py-4 text-[13px] text-fd-muted-foreground sm:px-8">
        <span className="font-mono text-fd-foreground">au1h</span>
        <span aria-hidden="true">·</span>
        <a href={`${REPO}/blob/main/LICENSE`} className="hover:text-fd-foreground">
          MIT
        </a>
        <span aria-hidden="true">·</span>
        <a href={REPO} className="hover:text-fd-foreground">
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
