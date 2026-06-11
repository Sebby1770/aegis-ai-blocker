# Launch Checklist

Use this when you are ready to turn the local preview into a paid SaaS.

## 1. Connect Supabase

1. Run `supabase login`.
2. Create a Supabase project in the dashboard.
3. Run `supabase link --project-ref YOUR_PROJECT_REF`.
4. Run `supabase db push` (applies `supabase/migrations/`, including the security-hardening
   migration with `audit_logs`, `rate_limits`, and refund mapping).
5. Copy the project URL, publishable key, and server secret key into Vercel environment variables.
6. Run the Supabase **advisors** (security + performance) and fix anything they flag.
7. Enable scheduled backups / PITR in the Supabase dashboard.

Keep the server secret key out of the browser. Only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` should be visible to frontend code.

## 2. Connect Stripe

1. Create a one-time Price for the lifetime product.
2. Set `STRIPE_LIFETIME_PRICE_ID` to that Price ID.
3. Set `STRIPE_SECRET_KEY` from the Stripe dashboard.
4. Create a webhook for `/api/stripe-webhook` listening for **all four** events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `charge.refunded`
   - `charge.dispute.created`
5. Set `STRIPE_WEBHOOK_SECRET` from that webhook.
6. Set `VITE_LIFETIME_PRICE_DISPLAY` to match the Price (display only).

The app grants licenses only after a signed webhook confirms payment — and revokes them when
Stripe reports a refund or dispute.

## 3. Deploy

1. Set every variable from `.env.example` in Vercel.
2. Deploy the app (connect the GitHub repo for CI-gated deploys).
3. Buy the lifetime product once with a Stripe test card.
4. Confirm the user has an active row in `public.lifetime_licenses` and an
   `license.activated` entry in `public.audit_logs`.
5. **Refund the test payment** in the Stripe dashboard and confirm the license flips to
   `refunded` and exports lock again.
6. Run `npm run verify` and `npm run audit:deps` before switching to live Stripe keys.

## 4. Monitoring

1. Point an uptime monitor (UptimeRobot, Pingdom, or Vercel checks) at `/api/health`.
2. Enable Vercel function-error alerts; optionally add a log drain (Axiom/Datadog/Logtail) —
   logs are structured JSON with request IDs.
3. Turn on Stripe email alerts for disputes and failed webhook deliveries.

## 5. Before announcing

1. Confirm `/privacy`, `/terms`, and `/refunds` reflect how you actually operate (and have them
   reviewed if you can — they are a starting point, not legal advice).
2. Click through the full funnel on a phone: landing → sign-in → checkout → download.
3. Check the README badge shows CI green.

## 6. Keep it easy for customers

Customers should only need to:

1. Pick their device.
2. Sign in by email.
3. Buy lifetime access once.
4. Download the recommended setup file.

Keep advanced rule formats available, but do not make customers choose them unless they already
know what they want.
