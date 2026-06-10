# SaaS Security Checklist

This maps the screenshot checklist to the controls in this repository. It is a launch baseline, not a mathematical guarantee that bugs can never exist.

| Risk | Control in this repo |
| --- | --- |
| Exposed database credentials, public `.env`, hardcoded keys | `.env` files ignored; only `.env.example` placeholders tracked; secrets are read server-side from environment variables. |
| Weak/missing auth | Supabase Auth required for entitlement and Checkout API calls. |
| Missing authorization, cross-user data access, IDOR | API derives `user_id` from the Supabase bearer token; RLS policies scope reads/writes with `auth.uid()`. |
| Open database read/write permissions | RLS enabled on public tables; license and payment event writes are server-only. |
| Misconfigured Supabase buckets | No storage buckets are used. |
| Admin/debug routes exposed | No admin or debug API routes are included. |
| Build logs/secrets and verbose errors | API responses use generic error codes; no secret values are logged. |
| Leaked repos/history | No secrets are committed; run secret scans before every push. |
| Secrets in frontend JavaScript | Only `VITE_SUPABASE_PUBLISHABLE_KEY` is browser-visible; Stripe and Supabase secret keys are server-only. |
| Client-side-only checks | Payment fulfillment happens only in a signed Stripe webhook. Exports are gated by server entitlement checks. |
| Missing input validation | Checkout request body is validated with Zod; API body size is bounded. |
| SQL/NoSQL injection | Server code uses Supabase query builders, not string-built SQL. No NoSQL database is used. |
| XSS | React escapes rendered text; downloaded exports are generated as text files with fixed filenames. |
| CSRF | Mutating APIs require bearer auth and same-origin checks. |
| Insecure uploads/path traversal/SSRF | No upload, filesystem path, or server-side URL-fetch features are exposed. |
| Password reset/session/JWT issues | Auth is delegated to Supabase; server validates access tokens with `auth.getUser()`. |
| Permissive CORS | API allows same-origin/configured origins only, never wildcard origins. |
| Missing rate limits | API routes include best-effort IP rate limits; production can add Vercel Firewall or edge rate limits. |
| Staging/default credentials | `.env.example` contains no real values; deploy environments must set real secrets outside Git. |
| Unsigned webhooks | Stripe webhook uses `Stripe-Signature` and raw body verification. |
| Frontend-only payment checks | Stripe event verification writes `lifetime_licenses`; frontend cannot create licenses. |
| Logs containing private data | Code logs generic event labels only. |
| Source maps exposed | Vite production sourcemaps are disabled. |
| Dependency vulnerabilities/outdated packages | `npm audit --audit-level=moderate` is part of release checks. |
| Prompt injection / AI tool permissions | The app has no model-calling features or AI tools. |
| Excessive DB permissions | User-facing access is RLS-scoped; server-only operations require the Supabase secret key. |
| No audit logs | Stripe `payment_events` records webhook event processing. |
| Monitoring/backups | Configure these in Supabase/Vercel production dashboards before launch. |
| Public internal dashboards | No internal dashboard is shipped. |
| Missing security headers | Vercel config adds nosniff, referrer policy, frame denial, and permissions policy. |
| Cookie flags | Browser auth is handled by Supabase client storage; do not add custom insecure cookies. |
| Unencrypted sensitive data | Use HTTPS-only deployment; Supabase and Stripe handle transport encryption. |
| Poor tenant isolation | Current scope is per-user licensing; all user rows are scoped by authenticated user ID. |
| Over-trusting generated code | Keep `npm run verify`, audits, and security review required before deployment. |
