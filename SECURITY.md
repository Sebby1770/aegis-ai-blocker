# Security Policy

## Scope

Aegis AI Blocker protects by generating local blocklists. It does not inspect private browsing content, proxy credentials, or upload browsing history.

## Secrets

Do not commit:

- Supabase secret/service-role keys
- Stripe secret keys or webhook secrets
- App Store shared secrets
- Vercel tokens

Only publishable Supabase keys belong in client-side builds.

## Implemented Controls

- Stripe Checkout is created server-side.
- Stripe webhook fulfillment requires signature verification.
- Payment events are stored for idempotency.
- License rows are written only from server-side code with the Supabase service role.
- Supabase RLS is enabled for all public SaaS tables.
- Browser reads are scoped to the authenticated user.
- API routes require bearer auth where user data or purchases are involved.
- API routes enforce method checks, same-origin checks, small JSON bodies, generic errors, no-store cache headers, and best-effort rate limits.
- Vite source maps are disabled for production builds.
- `.env` files are ignored; `.env.example` is the only tracked env file.

## Checklist From The Security Screenshots

The repo is designed to defend against the listed classes by avoiding committed secrets, public `.env` files, frontend-only payment checks, open database writes, unsigned webhooks, source maps, and permissive CORS. It also adds RLS, owner-scoped policies, input validation, dependency auditing, and security headers.

See `docs/security-checklist.md` for the mapped checklist.

No checklist can prove absence of all future bugs. Treat this as a hardening baseline and keep running `npm run verify`, `npm audit`, Supabase advisors, and a review of deployed environment variables before production launch.

## Reporting Issues

Open a GitHub issue with:

- impacted platform
- affected export format
- exact rule or domain
- expected and actual behavior

## Known Limits

No static blocklist can guarantee complete AI blocking forever. Domains, CDNs, embedded widgets, and first-party AI surfaces change over time.
