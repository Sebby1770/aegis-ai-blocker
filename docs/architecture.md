# Aegis AI Blocker Architecture

Aegis is split into four layers:

1. Shared rule pack in `src/data/ai-services.json`.
2. Web dashboard in `src/` for toggles, testing, and exports.
3. Server-side API routes in `api/` for Stripe Checkout, webhooks, and entitlements.
4. Generated network blocklists in `rules/generated/`.
5. iOS SwiftUI app in `ios/` for mobile rule management and sharing.

## Blocking Model

The app generates blocklists for tools that actually enforce network rules: AdGuard/uBlock DNS filters, hosts files, dnsmasq, Safari content blocker JSON, and managed DNS services. A normal web page cannot block network traffic system-wide by itself.

The iOS app scaffold is honest about platform limits. For true device-wide blocking on iOS, a production build needs Apple Network Extension capabilities or a managed DNS provider. Without those entitlements, the app can still manage/export rules and guide setup.

## One-Time Purchase

The payment model is designed as a lifetime license:

- Web: Stripe Checkout creates a single lifetime purchase.
- iOS: StoreKit product `ai_blocker_lifetime`.
- Supabase: `lifetime_licenses` stores the verified entitlement.

Clients should only read license state. Server-side Stripe and App Store webhook handlers must verify payment events before inserting license rows.

## SaaS Trust Boundaries

- Browser: can request sign-in, start Checkout, and read its own entitlement.
- API routes: validate Supabase bearer tokens, enforce same-origin requests, rate-limit requests, and avoid detailed error leaks.
- Stripe webhook: verifies `Stripe-Signature`, deduplicates event IDs in `payment_events`, and writes licenses only after `checkout.session.completed` reports a paid session.
- Supabase: RLS is enabled on public tables. User-facing rows are scoped by `auth.uid()`. `payment_events` has no public policies and is only written with the server-side service role.

The Supabase secret key, Stripe secret key, and webhook secret are server-only. They must never use the `VITE_` prefix.

## Rule Updates

Rule packs should be versioned and released with every app update. The generated files are deterministic:

```bash
npm run generate:rules
```

Blocking “all AI” is not a stable claim. New providers and embedded AI features need recurring rule maintenance.
