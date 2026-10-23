// What the browser gets to see. Secrets (review tokens, raw PayPal objects)
// stay on the server unless the viewer is meant to have them.

import type { Purchase } from "./store/purchases";

export function purchaseView(p: Purchase, { includeReviewLink = false }: { includeReviewLink?: boolean } = {}) {
  return {
    id: p.id,
    state: p.state,
    item: p.item,
    reviewedCents: p.reviewedCents,
    paypalAmountCents: p.paypalAmountCents,
    currency: p.currency,
    category: p.category,
    recurring: p.recurring,
    terms: p.terms,
    decision: p.decision,
    paypal: {
      orderId: p.paypalOrderId,
      authorizationId: p.paypalAuthorizationId,
      captureId: p.paypalCaptureId,
    },
    reviewExpiresAt: p.reviewExpiresAt,
    // Shown in the demo so the split screen can open the reviewer's page. A real app would send it by text or email.
    reviewPath: includeReviewLink && p.reviewToken ? `/review/${p.reviewToken}` : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
