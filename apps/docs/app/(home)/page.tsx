import Link from 'next/link';

const features = [
  {
    title: 'One deployment, many apps',
    body: 'Register each product with a slug. The same email is a separate user, password and session in every application.',
  },
  {
    title: 'Zero auth code in your backend',
    body: 'Verify an EdDSA JWT against a public JWKS, or sit behind the gateway and read trusted headers. SDKs for TypeScript, Go and Python.',
  },
  {
    title: 'Built on Better Auth',
    body: 'Email + password, GitHub and Google, organizations, sessions in Postgres and Redis. Self-hosted, MIT licensed.',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-3 rounded-full border px-3 py-1 text-xs text-fd-muted-foreground">
        Self-hosted auth for all of your apps
      </p>
      <h1 className="mb-4 text-4xl font-bold tracking-tight">au1h</h1>
      <p className="mb-8 max-w-xl text-fd-muted-foreground">
        Authentication-as-a-service you run yourself. One server hosts login, sessions, OAuth and
        JWTs for every product you build, with strict per-application isolation and an API
        gateway that forwards verified identity to your backends.
      </p>
      <div className="mb-16 flex gap-3">
        <Link
          href="/docs"
          className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          Get started
        </Link>
        <Link href="/docs/examples" className="rounded-md border px-4 py-2 text-sm font-medium">
          See the examples
        </Link>
      </div>
      <div className="grid max-w-4xl gap-4 text-left md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-lg border p-4">
            <h2 className="mb-1 font-semibold">{f.title}</h2>
            <p className="text-sm text-fd-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
