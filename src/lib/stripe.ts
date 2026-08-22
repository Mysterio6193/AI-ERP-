import Stripe from "stripe"

let stripeClient: Stripe | null | undefined

export function getStripeClient() {
  if (stripeClient !== undefined) {
    return stripeClient
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    stripeClient = null
    return null
  }

  stripeClient = new Stripe(secretKey)
  return stripeClient
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function resolveStripeReturnOrigin(request: Request) {
  const origin = request.headers.get("origin")
  return origin || process.env.CUSTOMER_WEB_ORIGIN || "http://localhost:3002"
}
