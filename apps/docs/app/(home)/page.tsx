import Link from 'next/link';
import { CodePanel, CopyButton } from '@/components/home/code-panel';

const INSTALL = 'bun add @au1h/client @au1h/server';

function Arrow({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

const PROOF = [
  {
    title: 'Per-app isolation',
    body: 'Same email, different user, password and session in every app.',
    icon: (
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Zm9.17 15.47-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65m20-5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    ),
  },
  {
    title: 'Zero auth code in your backend',
    body: 'Verify an EdDSA JWT against a public JWKS, or sit behind the gateway.',
    icon: (
      <>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
      </>
    ),
  },
  {
    title: 'Built on Better Auth',
    body: 'Email + password, OAuth, magic links, OTP, organizations. Postgres and Redis.',
    icon: (
      <>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </>
    ),
  },
];

const DOCS = [
  { href: '/docs/getting-started/installation', label: 'Getting started' },
  { href: '/docs/concepts/tenancy', label: 'Concepts' },
  { href: '/docs/sdks/client', label: 'SDKs' },
  { href: '/docs/reference/auth-api', label: 'Reference' },
];

export default function HomePage() {
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-10 px-4 py-8 sm:px-8 lg:gap-14 lg:py-6">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col items-start">
          <span className="box-border inline-flex h-7 items-center gap-2 rounded-full border border-fd-border px-3 text-[12.5px] text-fd-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-fd-primary" />
            Open source · MIT · self-hosted
          </span>
          <h1 id="hero-title" className="mt-5 max-w-[14ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-fd-foreground lg:text-[44px]">
            One auth server for all of your apps.
          </h1>
          <p className="mt-4 max-w-[58ch] text-[16.5px] leading-relaxed text-fd-muted-foreground">
            Deploy au1h once. Every product you build gets login, sessions, OAuth and JWTs, and the same
            email is a separate user in each one. Your backend verifies a token or trusts the gateway.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-fd-primary px-5 text-[14.5px] font-medium text-white transition-colors hover:bg-[#1F6BF0]"
            >
              Read the docs
              <Arrow />
            </Link>
            <Link
              href="/docs/examples"
              className="inline-flex h-11 items-center rounded-md border border-fd-border px-5 text-[14.5px] font-medium text-fd-foreground transition-colors hover:border-fd-muted-foreground/50 hover:bg-fd-secondary"
            >
              Run the examples
            </Link>
          </div>

          <div className="mt-4 flex w-full max-w-[460px] items-center gap-2 rounded-md border border-[#1c2230] bg-[#070a10] pl-4 pr-1 font-mono text-[13px] text-[#d6dbe6]">
            <span aria-hidden="true" className="select-none text-[#3ddc84]">
              $
            </span>
            <code className="min-w-0 flex-1 truncate py-3">{INSTALL}</code>
            <CopyButton text={INSTALL} label="Copy install command" />
          </div>

          <ul className="mt-7 grid w-full list-none grid-cols-1 gap-5 border-t border-fd-border p-0 pt-6 sm:grid-cols-3">
            {PROOF.map((item) => (
              <li key={item.title} className="flex flex-col gap-1.5">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F80FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon}
                </svg>
                <span className="text-sm font-semibold text-fd-foreground">{item.title}</span>
                <span className="text-[13px] leading-[1.5] text-fd-muted-foreground">{item.body}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-3">
          <CodePanel />
          <nav aria-label="Documentation" className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            {DOCS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="flex h-10 items-center justify-between border-t border-fd-border text-[13.5px] text-fd-foreground transition-colors hover:text-fd-primary"
              >
                {d.label}
                <Arrow size={13} />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
