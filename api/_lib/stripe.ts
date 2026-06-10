import Stripe from 'stripe'
import { requireEnv } from './env.js'

export function stripeClient() {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
  })
}
