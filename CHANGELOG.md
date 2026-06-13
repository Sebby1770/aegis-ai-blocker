# Changelog

All notable changes to the product and the rule pack.

## 2.0.0 — 2026-06-13

Aegis is now a policy engine for intentional digital boundaries, not just a blocker.

### Added
- **Policy modes.** Choose a value — Strict no-AI, Focus, Child-safe, School exam,
  Workplace compliance, Creative tools allowed, Research allowed/chat blocked — and
  Aegis sets the rules. Manual tuning shows as a "Custom" policy. Your choice persists.
- **Explainability.** Every domain check now answers *why*: which service, which
  category, exact vs. parent-domain match, and strict-only status.
- **Trust metadata.** Every service carries a breakage-risk label (low/medium/high),
  a last-verified date, and side-effect notes for domains that overlap non-AI tools.
- **Public Catalog page** (`/catalog`) — searchable, every rule in the open, with
  stewardship stats. The "maintained garden", not a black box.
- **Philosophy page** (`/philosophy`) — the reframe, and an honest line on what is
  enforced today (block) versus the roadmap (warn, delay, schedule, rituals — these
  need an always-on agent).

### Changed
- New claim: "Decide where AI is allowed in your life." Home reframed around values.
- The Protection page leads with policy modes; the rule tester is now an explainer.

### Honesty note
- Warn/Delay/Schedule friction levels and notification-driven rituals are intentionally
  **not** shipped as toggles, because a static blocklist cannot enforce them. They are
  on the roadmap behind the active agent (e.g. the iOS Network Extension).

## 1.4.0 — 2026-06-13

### Changed
- The dashboard is now four focused pages with working sidebar navigation:
  Setup (guided three-step onboarding with inline sign-in), Protection
  (category toggles with expandable service lists and the rule tester),
  Blocklists (export formats with per-format guidance), and Account.
- Each dashboard page fits a single screen; the marketing footer no longer
  renders inside the app.
- Your category, strict mode, and format choices now persist across visits.

### Removed
- The illustrative "example activity" panel — real controls only.

## 1.3.0 — 2026-06-12

### Added
- Support, Changelog, and Security are now pages on the site itself instead of
  GitHub links; the changelog page renders this file directly.
- Wider desktop layout so the site fills modern screens.

## 1.2.0 — 2026-06-12

### Added
- Installable PWA: web app manifest plus an offline service worker, so the
  dashboard installs to a home screen and loads without a connection.
- `GET /api/export` — authenticated, audit-logged rule downloads for licensed
  accounts, built for automation (curl, router cron jobs, Shortcuts).
- The marketing site is now multi-page: a compact home plus dedicated
  /features, /pricing, and /faq pages with per-route titles and descriptions.

### Changed
- Domain matching now uses a suffix trie (O(labels) per lookup instead of a
  linear rule scan), keeping the tester and exports instant at any pack size.

## 1.1.0 — 2026-06-11

### Added
- iOS rule data is now generated from the shared rule pack (`RulePackData.generated.swift`),
  so web and iOS can never drift apart.
- Live domain checker on the landing page — runs entirely in the browser.
- `/.well-known/security.txt` (RFC 9116) and this changelog.

## 1.0.0 — 2026-06-11

### Rule pack 2026.06.11
- Expanded from 45 to 73 services (118 default domains, 126 strict): added DeepSeek, Qwen, Kimi,
  Pi, Manus, Janitor AI, QuillBot, Grammarly (strict), Genspark, Andi, iAsk, Komo, Lovable, Bolt,
  v0, Devin, Tabnine, Augment, Sourcegraph (strict), Sora, Luma, Pika, Kling, Hailuo, HeyGen,
  Black Forest Labs, Krea, Recraft, Civitai, Adobe Firefly, Google Labs, NotebookLM, Azure OpenAI,
  xAI API, Cohere, Groq, Together, Fireworks, Cerebras, OpenRouter, Vertex AI (strict),
  Ollama (strict), LM Studio (strict).

### Added
- Marketing landing page with pricing, FAQ, and live coverage stats.
- Privacy Policy, Terms of Service, and Refund Policy pages.
- Checkout return flow that polls entitlement until the Stripe webhook lands.
- Automatic license revocation on Stripe refunds and disputes.
- Durable cross-instance rate limiting backed by Postgres.
- Server-only audit log of license activations, refunds, and revocations.
- Structured JSON API logging with secret/PII redaction and request IDs.
- `/api/health` liveness endpoint for uptime monitoring.
- Content-Security-Policy and HSTS headers on all responses.
- Vitest test suite (39 tests) and GitHub Actions CI with npm audit and gitleaks.
- Dependabot updates for npm and GitHub Actions.
- SEO metadata, robots.txt, SPA routing, immutable CDN caching for assets.
- Source-available LICENSE.

### Security
- Webhook idempotency hardened against duplicate-delivery races.
- Payment intents recorded on licenses so refunds map without trusting client input.
