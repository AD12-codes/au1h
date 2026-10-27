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
    body: 'Email + password, GitHub, Google, organizations. Postgres and Redis.',
    icon: (
      <>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </>
    ),
  },
];

const STEPS = [
  {
    title: 'Register an app → get a slug',
    body: (
      <>
        Each app you register gets a slug, like <Code>todo</Code>, that scopes its users.
      </>
    ),
  },
  {
    title: 'Sign users in with x-app-id',
    body: (
      <>
        Send <Code>x-app-id: todo</Code> on every auth request and the user lives in that app only.
      </>
    ),
  },
  {
    title: 'Verify the JWT or use the gateway',
    body: (
      <>
        Check the EdDSA token with <Code>aud = "todo"</Code>, or let the gateway do it for you.
      </>
    ),
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-fd-border bg-au-surface-2 px-1.5 py-px font-mono text-[12.5px] text-fd-foreground">
      {children}
    </code>
  );
}

function Row({ href, children, accent }: { href: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-11 items-center justify-between border-t border-fd-border text-[14.5px] transition-colors hover:text-fd-primary ${accent ? 'text-fd-primary' : 'text-fd-foreground'}`}
    >
      {children}
      <Arrow size={14} />
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div aria-hidden="true" className="au-hero-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 py-12 sm:px-8 lg:gap-16 lg:py-24">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col items-start">
            <span className="box-border inline-flex h-7 items-center gap-2 rounded-full border border-fd-border px-3 text-[12.5px] text-fd-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-fd-primary" />
              Open source · MIT · self-hosted
            </span>
            <h1 id="hero-title" className="mt-6 max-w-[14ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-fd-foreground lg:text-[44px]">
              One auth server for all of your apps.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-fd-muted-foreground">
              Deploy au1h once. Every product you build gets login, sessions, OAuth and JWTs, and the same
              email is a separate user in each one. Your backend verifies a token or trusts the gateway.
              That’s it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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
            <div className="mt-4 flex max-w-full items-center gap-1 font-mono text-[13px] text-fd-muted-foreground">
              <span aria-hidden="true" className="opacity-60">
                $
              </span>
              <code className="ml-1.5 truncate">{INSTALL}</code>
              <CopyButton text={INSTALL} label="Copy install command" />
            </div>

            <ul className="mt-9 grid w-full list-none grid-cols-1 gap-6 border-t border-fd-border p-0 pt-7 sm:grid-cols-3">
              {PROOF.map((item) => (
                <li key={item.title} className="flex flex-col gap-2">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F80FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                  <span className="text-sm font-semibold text-fd-foreground">{item.title}</span>
                  <span className="text-[13.5px] leading-[1.55] text-fd-muted-foreground">{item.body}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0 flex-[1_1_480px]">
            <CodePanel />
          </div>
        </div>
      </section>

      <section aria-labelledby="how-title" className="border-t border-fd-border">
        <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-8 lg:py-20">
          <h2 id="how-title" className="mb-8 font-mono text-[12.5px] font-medium uppercase tracking-[0.08em] text-fd-muted-foreground">
            How it works
          </h2>
          <div className="relative">
            <div aria-hidden="true" className="absolute left-4 top-4 hidden h-px bg-fd-border sm:block" style={{ right: 'calc((100% - 64px) / 3 - 16px)' }} />
            <div aria-hidden="true" className="absolute bottom-10 left-4 top-4 w-px bg-fd-border sm:hidden" />
            <ol className="relative m-0 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-row gap-4 sm:flex-col">
                  <span aria-hidden="true" className="box-border flex size-8 flex-none items-center justify-center rounded-full border border-fd-border bg-fd-background font-mono text-[13px] text-fd-primary">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[15px] font-semibold text-fd-foreground">{step.title}</span>
                    <span className="text-sm leading-relaxed text-fd-muted-foreground">{step.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section aria-label="Documentation and examples">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-4 px-4 pb-14 sm:px-8 md:grid-cols-2 lg:pb-20">
          <div className="flex flex-col gap-4 rounded-lg border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary">
            <div className="flex items-center gap-2.5">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F80FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              <h3 className="m-0 text-[17px] font-semibold text-fd-foreground">Documentation</h3>
            </div>
            <p className="m-0 text-sm leading-relaxed text-fd-muted-foreground">From a first deploy to the full API surface.</p>
            <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2">
              <li><Row href="/docs/getting-started/installation">Getting started</Row></li>
              <li><Row href="/docs/concepts/tenancy">Concepts</Row></li>
              <li><Row href="/docs/sdks/client">SDKs</Row></li>
              <li><Row href="/docs/reference/auth-api">Reference</Row></li>
            </ul>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary">
            <div className="flex items-center gap-2.5">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F80FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 17 6-6-6-6M12 19h8" />
              </svg>
              <h3 className="m-0 text-[17px] font-semibold text-fd-foreground">Examples</h3>
            </div>
            <p className="m-0 text-sm leading-relaxed text-fd-muted-foreground">
              Four backends — Go, Rust, Python, TypeScript — sign in with the same email in each.
            </p>
            <div className="flex flex-wrap gap-2">
              {['go', 'rust', 'python', 'typescript'].map((l) => (
                <span key={l} className="inline-flex h-[26px] items-center rounded-md border border-fd-border bg-au-surface-2 px-2.5 font-mono text-[12px] text-fd-foreground">
                  {l}
                </span>
              ))}
            </div>
            <div className="mt-auto">
              <Row href="/docs/examples">Run the examples</Row>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
