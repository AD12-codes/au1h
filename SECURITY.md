# Security policy

au1h is an authentication service, so security reports get priority over everything else.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository
(https://github.com/AD12-codes/au1h/security/advisories/new).

Include what you can: affected version or commit, a description, steps or a proof of
concept, and the impact you see. You will get an acknowledgement within 72 hours and a
fix or mitigation plan within 14 days for confirmed issues. Credit is given in the release
notes unless you prefer otherwise.

## Scope

In scope: anything in this repository, in particular

- cross-application or cross-workspace access (a user, session, token, link or code of
  one application being accepted by another);
- admin API or admin portal authorization bypasses;
- the `/proxy` gateway (header spoofing, SSRF through route targets);
- JWT verification in the `@au1h/server`, Go and Python packages;
- secret or token handling (storage, logging, comparison).

Out of scope: vulnerabilities in dependencies that are already public (report upstream,
then tell us if a fix needs to land here), denial of service against your own deployment,
and findings that require a compromised host or database.

## Supported versions

The `main` branch and the latest published packages and images receive fixes.

## Hardening checklist for operators

- Run with `NODE_ENV=production`: secure cookies, Better Auth's rate limiter and the
  private-backend policy for proxy routes are on.
- Keep `BETTER_AUTH_SECRET` long and random; rotating it signs everyone out and re-keys JWTs.
- Put the server behind TLS and set `AU1H_TRUST_PROXY=true` only when your proxy sets
  `x-forwarded-for`.
- Restrict admin sign-up with `AU1H_ADMIN_EMAILS` after the first account.
- Treat application secrets (`au1h_sk_…`) and personal access tokens (`au1h_pat_…`) like
  passwords; only hashes are stored, so lost ones must be rotated.
