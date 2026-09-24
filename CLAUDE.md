# CLAUDE.md

Aegis AI Blocker: a paid (one-time lifetime) product that turns a policy ("Focus", "Child-safe",
"School exam", …) into AI-service blocklists. Payments and enforcement are the product: treat
`api/`, `supabase/`, and `extension/` changes as security-sensitive.

## Architecture

| Path | What it is |
| --- | --- |
| `src/` | React 19 + Vite SPA: marketing pages, `/app` dashboard, 30-line router (`src/router.ts`), `SaasProvider` (`src/lib/saas.tsx`) for session/entitlement/checkout |
| `src/data/ai-services.json` | **The rule pack**: single source of truth for every domain, category, policy, breakage-risk label and verified date |
| `src/lib/blocklists.ts` | Pack resolution + export formats (AdGuard, hosts, dnsmasq, plain, Safari JSON). Shared by the SPA and `api/export.ts` |
| `api/` | Vercel serverless functions. `_lib/http.ts` = `guardRequest` (headers → preflight → method → origin → rate limit) |
| `supabase/migrations/` | Schema + RLS. `schema.sql` mirrors the migrations for one-shot setup; keep both in sync |
| `extension/` | Manifest V3 "Aegis Enforcer": `enforce.js` (pure: pack + state → DNR rules), `pack-validate.js` (sanitizes the self-updating remote pack), `background.js` (service worker), `popup.*` |
| `scripts/generate-blocklists.mjs` | Regenerates `rules/generated/*`, `extension/rules/pack.json`, `ios/AegisAIBlocker/RulePackData.generated.swift` from the pack |
| `scripts/vite-api-dev.ts` | Dev-only Vite plugin that serves `api/*.ts` at `/api/*` under `npm run dev` |
| `ios/` | SwiftUI companion app (XcodeGen); consumes the generated Swift rule data |

## Commands

```bash
npm ci                    # exact install (the SessionStart hook does this in cloud sessions)
npm run dev               # SPA + /api/* on one Vite server; env from .env.local
npm run verify            # generate:rules → lint → typecheck:api → test → build (run before pushing)
npm test                  # Vitest (all *.test.ts, incl. api/ and extension/)
npm run test:e2e          # Playwright: unpacked extension in real Chromium (e2e/*.pw.ts)
npx vitest run path/to/file.test.ts
npm run generate:rules    # after editing src/data/ai-services.json — commit the generated files
npm run typecheck:api     # api/ has its own tsconfig (tsconfig.api.json)
npm run audit:deps        # npm audit --audit-level=high (CI gate)
npm run check:bundle      # build with canary secrets; fails if a server secret reaches dist/
npm run verify:buy-flow   # end-to-end buy flow against `npm run dev`; needs real keys in .env.local
```

CI (`.github/workflows/ci.yml`) additionally fails if the generated files drift from the pack, and
runs gitleaks. Never hand-edit `rules/generated/`, `extension/rules/pack.json`, or
`RulePackData.generated.swift`.

## Trust boundaries

- **Browser is untrusted.** The UI's license gate is cosmetic; the server decides. The browser may
  sign in (Supabase magic link), start Checkout, and read its own entitlement — nothing else.
- **Identity comes only from the bearer token** (`authenticateBearer` → `auth.getUser`). Never
  accept a user id, price, amount, or quantity from a request body or query.
- **Licenses are written only by `api/stripe-webhook.ts`** after `constructEvent` verifies the
  Stripe signature over the raw body. Refunds (`charge.refunded`) and disputes
  (`charge.dispute.created`) revoke through the same path. `payment_events` is the idempotency ledger.
- **Service-role key, Stripe secret key, webhook secret are server-only.** Only `VITE_*` values
  reach the bundle; a server secret must never get a `VITE_` prefix.
- **RLS on every table.** `lifetime_licenses` is owner-read-only; `payment_events`, `audit_logs`,
  `rate_limits` have no client policies. `consume_rate_limit` is service-role-only.
- **Errors are generic** (`sendError(res, status, code)` + request id); logs go through `logEvent`,
  which redacts keys/JWTs/emails. Never log or return raw errors.
- **Extension**: requests no host permissions; the remote pack is untrusted input and must pass
  `sanitizePack` (size caps, domain validation, no version downgrade) before it reaches DNR.

## Conventions

- Tests sit next to code (`foo.ts` + `foo.test.ts`). Security fixes land with a test that fails first.
- Handler-level API tests live in `api/_tests/` (the `_` prefix keeps Vercel from deploying them as
  functions; never put a `*.test.ts` directly in `api/`). They run real handlers against
  `fake-supabase.ts` and real Stripe signatures via `harness.ts`.
- Extension e2e tests live in `e2e/` (`*.pw.ts`, so Vitest ignores them). The harness maps every
  hostname to a local HTTPS server; `probe.reached(host)` is ground truth for "got through". In
  cloud sessions it falls back to the preinstalled Chromium under `$PLAYWRIGHT_BROWSERS_PATH`.
- Export formats are validated by independent parsers in `src/test/format-parsers.ts`; Safari
  url-filters must stay inside WebKit's regex subset (no `|`, `$` only last).
- SQL/RLS tests live in `supabase/tests/` and run on PGlite (no Docker). Any schema change goes in
  a new migration **and** `schema.sql`; the snapshot test fails if they diverge.
- Use Stripe test-mode fixtures and mocks; never commit real keys (`.env*` is gitignored).
- User-facing changes go in `CHANGELOG.md`; security controls in `SECURITY.md` and
  `docs/security-checklist.md`. Pricing and legal copy (`src/pages/Legal.tsx`, `Pricing.tsx`) need
  the owner's sign-off.
