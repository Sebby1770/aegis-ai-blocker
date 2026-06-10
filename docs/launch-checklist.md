# Launch Checklist

Use this when you are ready to turn the local preview into a paid SaaS.

## 1. Connect Supabase

1. Run `supabase login`.
2. Create a Supabase project in the dashboard.
3. Run `supabase link --project-ref YOUR_PROJECT_REF`.
4. Run `supabase db push`.
5. Copy the project URL, publishable key, and server secret key into Vercel environment variables.

Keep the server secret key out of the browser. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` should be visible to frontend code.

## 2. Connect Stripe

1. Create a one-time Price for the lifetime product.
2. Set `STRIPE_LIFETIME_PRICE_ID` to that Price ID.
3. Set `STRIPE_SECRET_KEY` from the Stripe dashboard.
4. Create a webhook for `/api/stripe-webhook`.
5. Set `STRIPE_WEBHOOK_SECRET` from that webhook.

The app grants licenses only after Stripe sends a signed `checkout.session.completed` webhook.

## 3. Deploy

1. Set every variable from `.env.example` in Vercel.
2. Deploy the app.
3. Buy the lifetime product once with a Stripe test card.
4. Confirm the user has an active row in `public.lifetime_licenses`.
5. Run `npm run verify` and `npm audit --audit-level=moderate` before switching to live Stripe keys.

## 4. Keep It Easy For Customers

Customers should only need to:

1. Pick their device.
2. Sign in by email.
3. Buy lifetime access once.
4. Download the recommended setup file.

Keep advanced rule formats available, but do not make customers choose them unless they already know what they want.
