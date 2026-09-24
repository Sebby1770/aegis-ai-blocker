# Security Policy

## Reporting a vulnerability

Please report security issues privately first:

1. Use GitHub's **"Report a vulnerability"** (Security tab → Private vulnerability reporting) on
   this repository, or open a GitHub issue *without* exploit details asking for a private contact.
2. Include: the affected endpoint or file, reproduction steps, and impact.
3. You can expect an acknowledgement within 72 hours. Please allow up to 30 days for a fix before
   public disclosure.

Do not test against production with real customer data. Account takeover attempts, data
exfiltration, and denial-of-service testing are out of scope without prior written agreement.

## Scope

Aegis generates local blocklists. It does not inspect private browsing content, proxy credentials,
or upload browsing history. The attack surface is:

- the static web app and its three authenticated API routes
- the Stripe webhook handler
- the Supabase schema and its RLS policies

## Secrets

Never commit:

- Supabase secret/service-role keys
- Stripe secret keys or webhook secrets
- App Store shared secrets
- Vercel tokens

Only publishable Supabase keys belong in client-side builds (`VITE_` prefix). CI runs gitleaks on
every push; `.env*` files are gitignored with only `.env.example` tracked.

## Implemented controls

**Payments and licensing**

- Stripe Checkout sessions are created server-side; the client never sets prices, products,
  quantities, or the purchasing user (strict request schema; tested).
- Webhook fulfillment requires `Stripe-Signature` verification over the raw body (5-minute replay
  tolerance).
- Fulfillment is bound to our own sessions: only `mode: payment` sessions stamped with the
  server-set `metadata.product` are fulfilled, and the user comes from server-set metadata — never
  from `client_reference_id` alone, which Payment Links accept from the URL.
- Event processing is idempotent (`payment_events` ledger), and a license row is inserted exactly
  once per session: retries and concurrent deliveries can never flip a refunded or revoked license
  back to active.
- Refunds (`charge.refunded`) and disputes (`charge.dispute.created`) automatically revoke licenses.
  Because Stripe does not guarantee event order, fulfillment also asks Stripe for the charge's
  current refund/dispute state, and revocations leave a durable server-only marker keyed by payment
  intent, so a refund processed before or during a delayed fulfillment still wins.
- License rows are written only with the server-side service role.

**Authentication and authorization**

- Supabase Auth (magic links) with bearer-token validation via `auth.getUser()` on every
  protected route; user IDs come from the token, never the request body.
- RLS enabled on all tables; user-facing rows scoped by `auth.uid()`.
- `payment_events`, `audit_logs`, and `rate_limits` have no client policies at all.
- Clients can write only `profiles.email` and `profiles.display_name` (length-bounded) on their own
  row. The future device-sync tables (`devices`, `rule_snapshots`) are read-only to clients until
  that feature ships.
- RLS and privileges are tested against real Postgres semantics (PGlite) for both setup paths —
  the migrations and `supabase/schema.sql` — and a snapshot test fails if the two ever diverge.

**API hardening**

- Method gating, preflight handling, and same-origin checks on browser-facing routes; deployed
  environments never trust `localhost` origins.
- Durable Postgres-backed rate limiting across serverless instances (SHA-256-hashed keys, no raw
  IPs stored) with a memory-bounded in-memory fallback if the database is unreachable.
- Zod-validated request bodies with strict schemas and size limits.
- Generic error codes with request IDs; no stack traces or internals in responses.
- Structured JSON logging with automatic redaction of Stripe keys, JWTs, and email addresses.

**Browser extension**

- No host permissions by default; `declarativeNetRequest` block/allow rules need none.
- Delay mode's optional `<all_urls>` permission is requested only when the user picks Delay.
  Without it the worker compiles plain block rules: friction can only get stricter, never open.
- Delay passes are session-scoped `allowAllRequests` rules for one domain in one tab, granted by
  the worker against its own clock. Pass requests are accepted only from the top-level
  interstitial, which refuses to run framed and navigates only to `http(s)` URLs.
- Remote rule-pack updates are size-capped, structure-validated, and version-guarded.

**Headers and build**

- CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, referrer and
  permissions policies on both static pages and API responses.
- Production source maps disabled; immutable caching only for hashed assets; `no-store` on APIs.
- `npm run check:bundle` (CI) builds the SPA with canary values in every server-only variable and
  fails if any of them — or any Stripe/Supabase secret-shaped string — appears in the output.

**Supply chain**

- CI: lint, typecheck, tests, build, `npm audit --audit-level=high`, gitleaks secret scan, and a
  check that generated blocklists match the rule pack.
- Dependabot for npm and GitHub Actions.

The full mapping of the 50-risk launch checklist lives in
[docs/security-checklist.md](docs/security-checklist.md).

## Known limits

No static blocklist can guarantee complete AI blocking forever. Domains, CDNs, embedded widgets,
and first-party AI surfaces change over time; the rule pack is versioned and updated. No checklist
proves the absence of bugs — keep `npm run verify`, dependency audits, and Supabase advisors in the
release path.
