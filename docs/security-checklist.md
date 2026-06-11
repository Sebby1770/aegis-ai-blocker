# SaaS Security Checklist — 50-Risk Mapping

Each numbered risk from the launch checklist, and the control in this repository that addresses
it. This is a hardening baseline, not a guarantee that bugs can never exist.

| # | Risk | Control in this repo |
| --- | --- | --- |
| 1 | Exposed database credentials | Database is reached only through Supabase keys held in server-side env vars; nothing in git (verified across full history). |
| 2 | Public `.env` files | `.gitignore` blocks `.env*` and `*.local`; only placeholder `.env.example` is tracked; gitleaks runs in CI. |
| 3 | Hardcoded API keys | All keys come from `process.env` via `requireEnv()`; no literals in source. |
| 4 | Weak or missing authentication | Supabase Auth magic links; every protected route validates the bearer token server-side with `auth.getUser()`. |
| 5 | No authorization checks | User ID is derived from the verified token, never from request input; queries filter on that ID. |
| 6 | Users able to access other users' data | RLS policies scope every user-facing table to `auth.uid()`; API queries are additionally user-scoped. |
| 7 | Open database read/write permissions | RLS enabled on all tables; licenses/events/audit/rate-limit tables have no client write policies at all. |
| 8 | Misconfigured Firebase/Supabase/S3 buckets | No storage buckets are used; Supabase access is RLS-gated. |
| 9 | Admin routes left unprotected | No admin routes exist; admin actions happen in the Supabase/Stripe dashboards behind their own auth. |
| 10 | Debug pages exposed in production | No debug routes; unknown paths render a 404 page; `/api/health` returns only `{status, time}`. |
| 11 | Build logs leaking secrets | Build runs lint/test/build only; secrets live in Vercel env settings, not in build output or CI logs. |
| 12 | Verbose error messages leaking stack traces | All API errors return generic codes + request ID; stack traces never serialize into responses. |
| 13 | Leaked GitHub repos or commit history | History audited (no secrets ever committed); gitleaks scans every push in CI. |
| 14 | Secrets included in frontend JavaScript | Only `VITE_`-prefixed publishable values reach the bundle; Stripe/Supabase secrets are server-only. |
| 15 | Client-side-only security checks | Licensing is enforced by the server (`/api/entitlement`, webhook fulfillment); the UI gate is cosmetic UX. |
| 16 | Missing input validation | Zod strict schemas on request bodies; bounded body sizes; typed parsing everywhere. |
| 17 | SQL injection | All queries go through the Supabase query builder / RPC with bound parameters; no string-built SQL. |
| 18 | NoSQL injection | No NoSQL database is used. |
| 19 | Cross-site scripting (XSS) | React auto-escaping; no `dangerouslySetInnerHTML`; CSP (`script-src 'self'`) as backstop. |
| 20 | Cross-site request forgery (CSRF) | Bearer-token auth (no ambient cookies) + Origin allow-list on mutating routes. |
| 21 | Insecure file uploads | No upload functionality exists. |
| 22 | Path traversal bugs | No filesystem paths derive from user input; exports are generated in-memory with fixed names. |
| 23 | Server-side request forgery (SSRF) | The API fetches no user-supplied URLs; outbound calls go only to Stripe/Supabase SDK endpoints. |
| 24 | Broken password reset flows | Passwordless magic links — there is no reset flow to break. |
| 25 | Weak session management | Sessions are Supabase-managed JWTs with refresh handled by the client SDK; server never mints tokens. |
| 26 | JWT secrets weak, leaked, or reused | JWT signing stays inside Supabase; this codebase holds no JWT secret. |
| 27 | Overly permissive CORS | Explicit origin allow-list; no wildcards; preflight answers only for allowed origins. |
| 28 | Rate limits missing on login/signup/APIs | Durable Postgres-backed limits on checkout (12/min/IP) and entitlement (60/min/IP); Supabase rate-limits magic-link email sends; webhook is signature-gated. |
| 29 | Public test or staging environments | Single production target; Vercel preview deploys require the same env secrets and ship the same auth. |
| 30 | Default credentials left unchanged | No seeded users or default passwords exist anywhere. |
| 31 | Webhook endpoints without signature verification | `stripe.webhooks.constructEvent` over the raw body; unsigned requests are rejected. |
| 32 | Payment checks only on the frontend | Licenses are written exclusively by the signed webhook; refunds revoke them the same way. |
| 33 | Insecure direct object references (IDOR) | No object IDs are accepted from clients; everything keys off the authenticated user ID. |
| 34 | API endpoints trusting user-controlled IDs/roles | Checkout body carries only relative redirect paths (validated); identity always comes from the token. |
| 35 | Logs containing tokens, emails, passwords, private data | Structured logger redacts Stripe keys, JWTs, and emails by pattern; log fields are explicit allow-list style. |
| 36 | Source maps exposed in production | `build.sourcemap: false` in Vite config. |
| 37 | Dependency vulnerabilities | `npm audit --audit-level=high` fails CI; currently 0 known vulnerabilities. |
| 38 | Outdated packages | Dependabot opens weekly update PRs for npm and GitHub Actions. |
| 39 | Prompt injection in AI features | The product calls no LLMs; rule data is static JSON validated by tests. |
| 40 | AI tools accessing data without permission checks | No AI tools or agents run in this product. |
| 41 | Excessive database permissions for the app user | Browser uses the publishable key under RLS; service role is confined to serverless functions; the rate-limit RPC revokes execute from `anon`/`authenticated`. |
| 42 | No audit logs | `audit_logs` records activations, refunds, and dispute revocations; `payment_events` ledgers every webhook. |
| 43 | No monitoring or alerting | `/api/health` for uptime checks; structured logs + request IDs for Vercel alerts/drains; Stripe webhook-failure alerts; setup steps in the launch checklist. |
| 44 | No backup or restore plan | Supabase PITR/scheduled backups are a required launch-checklist step; schema and migrations are reproducible from git. |
| 45 | Publicly exposed internal dashboards | None are shipped; Supabase/Stripe/Vercel dashboards sit behind their own auth. |
| 46 | Missing security headers | CSP, HSTS, nosniff, frame denial, referrer policy, permissions policy on static pages and API responses. |
| 47 | Cookies missing HttpOnly/Secure/SameSite | The app sets no cookies; auth state lives in Supabase client storage over HTTPS-only origins. |
| 48 | Unencrypted sensitive data | TLS everywhere (HSTS-enforced); Supabase and Stripe encrypt at rest; no card data ever touches this codebase. |
| 49 | Poor tenant isolation in multi-user apps | Per-user isolation via RLS `auth.uid()` scoping on every user-facing row. |
| 50 | Over-trusting generated code without review | CI gates (lint, typecheck, 39 tests, audit, secret scan, rules-sync) on every change; SECURITY.md mandates review before release. |
