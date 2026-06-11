# Aegis AI Blocker — System Design

This document covers the full stack: design, architecture, frontend, backend, data, auth, hosting,
CI/CD, security, rate limiting, caching, observability, testing, and scaling.

## 1. System design

Aegis is a digital-goods SaaS with one product (a lifetime license) and one core asset (the
versioned AI-services rule pack). The design goal is **minimum trusted surface**: the browser is
untrusted, three small API routes hold the only server logic, and Stripe + Supabase carry the
heavy lifting (payments, auth, storage).

```text
Browser (React SPA)                 Vercel serverless API            Third parties
┌───────────────────────┐          ┌──────────────────────────┐     ┌──────────────┐
│ /        landing      │  bearer  │ POST /api/create-        │────▶│ Stripe       │
│ /app     dashboard    │  token   │       checkout-session   │     │ Checkout     │
│ /privacy /terms       │─────────▶│ GET  /api/entitlement    │     └──────┬───────┘
│ /refunds legal        │          │ GET  /api/health         │            │ signed
└──────────┬────────────┘          │ POST /api/stripe-webhook │◀───────────┘ webhook
           │ magic link            └────────────┬─────────────┘
           ▼                                    │ service role (server-only)
┌───────────────────────┐                       ▼
│ Supabase Auth         │          ┌──────────────────────────┐
└───────────────────────┘          │ Postgres + RLS           │
                                   │ profiles, licenses,      │
                                   │ payment_events,          │
                                   │ audit_logs, rate_limits  │
                                   └──────────────────────────┘
```

## 2. System architecture

Five layers:

1. **Rule pack** — `src/data/ai-services.json`, the versioned catalogue of AI services. Single
   source of truth for the dashboard, the generator script, and the iOS app.
2. **Web app** — Vite + React SPA with a dependency-free router. Marketing pages (`/`, legal) and
   the dashboard (`/app`).
3. **API routes** — Vercel serverless functions in `api/`, sharing `_lib` for guards, logging,
   Stripe, and Supabase access.
4. **Data** — Supabase Postgres with RLS; schema in `supabase/schema.sql` and migrations.
5. **Exports** — deterministic blocklist artifacts in `rules/generated/` (CI enforces sync).

## 3. Frontend

- React 19 + TypeScript, no router dependency (30-line history router in `src/router.tsx`).
- `SaasProvider` (`src/lib/saas.tsx`) owns session, entitlement, checkout, and toasts.
- Pages: landing (hero/pricing/FAQ), dashboard (rule builder, exports, account), legal
  (privacy/terms/refunds), 404.
- Checkout return flow polls the entitlement endpoint until the webhook lands, so buyers see
  "license active" without refreshing.
- Honest UI: the activity panel is labeled as an illustrative example; no fake telemetry.

## 4. APIs & backend logic

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/create-checkout-session` | POST | Bearer | Start Stripe Checkout for the lifetime price |
| `/api/entitlement` | GET | Bearer | Read the caller's license state |
| `/api/stripe-webhook` | POST | Stripe signature | Fulfill, refund, and revoke licenses |
| `/api/health` | GET | none | Liveness for uptime monitors |

Every route flows through `guardRequest`: security headers → preflight → method gate → origin
check → rate limit. User identity always derives from the verified bearer token; request bodies
never carry user IDs.

## 5. Databases & storage

Tables (all RLS-enabled):

- `profiles` — one row per auth user; readable/updatable only by the owner.
- `lifetime_licenses` — license state (`active`/`refunded`/`revoked`), provider references,
  `payment_intent` for refund mapping. Owner-readable, server-writable only.
- `payment_events` — webhook idempotency ledger. No client policies.
- `audit_logs` — license lifecycle trail. No client policies.
- `rate_limits` — durable rate-limit buckets (hashed keys). No client policies.
- `devices`, `rule_snapshots` — owner-scoped CRUD for future device sync.

No object storage is used. Backups: enable Supabase PITR (see launch checklist).

## 6. Auth & permissions

- Supabase Auth magic links — no passwords to leak or reset flows to break.
- API validates tokens with `auth.getUser()` server-side on every call.
- Postgres RLS scopes all user-facing reads/writes with `auth.uid()`.
- The service role is used only inside serverless functions; `consume_rate_limit()` is
  `security definer` with execute revoked from `anon`/`authenticated`.

## 7. Hosting & cloud

- **Vercel** — static SPA on the CDN edge + serverless functions. SPA rewrite excludes `/api/`.
- **Supabase** — managed Postgres + auth.
- **Stripe** — checkout, receipts, refunds, disputes, Radar fraud screening.
- All HTTPS; HSTS enabled; no servers to patch.

## 8. CI/CD & version control

- GitHub Actions on every push/PR: generated-rules sync check, ESLint, API typecheck, Vitest,
  production build, `npm audit --audit-level=high`, gitleaks secret scan.
- Dependabot: weekly npm + Actions updates (minor/patch grouped).
- Deploys: connect the repo to Vercel for preview deploys per PR and production on `main`.
- Database changes ship as files in `supabase/migrations/`.

## 9. Security

See [SECURITY.md](../SECURITY.md) and [security-checklist.md](security-checklist.md) — the full
50-risk mapping. Highlights: signed idempotent webhooks, automatic refund/dispute revocation,
RLS everywhere, durable rate limiting, CSP/HSTS, redacting structured logs, no secrets in git.

## 10. Rate limiting

`rateLimit()` calls the `consume_rate_limit` Postgres function: one atomic upsert per request,
shared across all serverless instances. Keys are `sha256(route:ip)` so no raw IPs are stored.
If Postgres is unreachable the limiter degrades to per-instance memory rather than failing the
API. Checkout: 12/min/IP. Entitlement: 60/min/IP. Webhook: gated by signature instead (Stripe
retries must never be rate-limited into failed fulfillments).

## 11. Caching & CDN

- Hashed build assets (`/assets/*`): `public, max-age=31536000, immutable` on the Vercel CDN.
- HTML: CDN-served, revalidated on deploy.
- API responses: `Cache-Control: no-store` — entitlement state must never be cached.
- The rule pack ships inside the bundle, so rule reads cost zero API calls.

## 12. Error tracking & logs

- All API logs are single-line JSON: `{ts, level, event, requestId, ...}` — searchable in Vercel
  logs and ready for a log drain (Datadog/Axiom/Logtail).
- A regex redactor strips Stripe keys, JWTs, and email addresses before any line is written.
- Every response carries `X-Request-Id`; errors return `{error, requestId}` so customers can quote
  an ID in support requests without leaking internals.
- Optional next step: add Sentry to the SPA build if frontend error tracking becomes necessary.

## 13. Monitoring & alerts

- `GET /api/health` for UptimeRobot/Pingdom/Vercel checks (no internals exposed).
- Vercel: enable function error alerts and log drains.
- Stripe: dashboard alerts for disputes and failed webhooks (webhook delivery retries surface
  failures loudly).
- Supabase: run the advisors (security + performance) before each launch; enable PITR backups.
- Audit trail: `audit_logs` records every activation, refund, and dispute revocation with actor
  and metadata.

## 14. Testing

- **Vitest** unit suites: blocklist generation/matching/export formats, rule pack data validation
  (schema, hostname syntax, global de-duplication), HTTP guards (methods, origins, rate limits,
  body limits, preflight), and log redaction.
- CI treats the rule pack as data under test — a malformed domain fails the build.
- Manual pre-launch pass: Stripe test-mode purchase → entitlement → refund → revocation.

## 15. Scaling

- The API is stateless; Vercel scales functions horizontally with zero configuration.
- The only shared mutable state (rate limits, licenses, events) lives in Postgres behind atomic
  upserts — no cross-instance coordination needed.
- Supabase scales vertically first (plan upgrade), then with read replicas; license reads are
  single-row indexed lookups, so headroom is large.
- The product itself is static-file-heavy: paying customers download text files, which the CDN
  absorbs at any traffic level.
- Cost profile at idle is near zero (serverless + free-tier Postgres), which suits a one-time
  purchase business.

## Blocking model

The app generates blocklists for tools that actually enforce network rules: AdGuard/uBlock DNS
filters, hosts files, dnsmasq, Safari content blocker JSON, and managed DNS services. A web page
cannot block traffic system-wide by itself, and the marketing copy never claims otherwise.

For true device-wide iOS blocking, a production iOS build needs Apple Network Extension
capabilities or a managed DNS provider. Without those entitlements, the iOS app manages and
shares rule exports.

## Rule updates

Rule packs are versioned (`version`, `updatedAt` in the JSON) and regenerate deterministically:

```bash
npm run generate:rules
```

CI fails if `rules/generated/` drifts from the pack. Blocking "all AI" is not a stable claim;
recurring rule maintenance is the product's core operating task — and the reason a lifetime
license stays valuable.
