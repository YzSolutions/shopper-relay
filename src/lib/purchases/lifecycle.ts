// The purchase lifecycle, kept pure so every rule about it can be tested
// without PayPal or a database. There are two flows.
//
// "hold": the shopper pays with their own PayPal (Mom).
//   evaluated ──► checkout ──► (hold placed) ──► completed            outcome "auto"
//       │             │                 └──────► awaiting_review ──► completed | declined | expired
//       ▼             └──► failed (amount mismatch, PayPal error)    outcome "review" / "exception"
//    blocked          └──► blocked (rules changed before the hold)
//
// "request": the reviewer pays (a parent, or a personal shopper's customer).
//   evaluated ──► requested ──► reviewer approves and pays ──► completed
//                     │    └──► declined | expired | canceled (nothing was ever held)
//                     └──► reviewer authorizes a one-time purchase up to a price
//                          ──► hunting ──► shopper buys it at or under the price ──► completed
//                                  └──► expired | canceled (the hold is voided)
//
// Any hold that doesn't end in "completed" is voided, so nothing is charged.

import type { Outcome } from "../policy";
import {
  checkPayPalAmount,
  evaluatePurchase,
  type AmountCheck,
  type CategoryKey,
  type Decision,
  type HistoryEntry,
  type RuleSet,
} from "../policy";

export const PURCHASE_STATES = [
  "evaluated",
  "blocked",
  "checkout",
  "awaiting_review",
  "requested",
  "hunting",
  "completed",
  "declined",
  "expired",
  "canceled",
  "failed",
] as const;
export type PurchaseState = (typeof PURCHASE_STATES)[number];

export type Flow = "hold" | "request";

/** States where the purchase is waiting on the reviewer, or on the shopper to use an authorization. */
export const OPEN_STATES: PurchaseState[] = ["awaiting_review", "requested", "hunting"];

const TRANSITIONS: Record<PurchaseState, PurchaseState[]> = {
  evaluated: ["checkout", "requested", "blocked", "canceled"],
  checkout: ["completed", "awaiting_review", "blocked", "failed", "canceled"],
  awaiting_review: ["completed", "declined", "expired", "canceled", "failed"],
  requested: ["completed", "hunting", "declined", "expired", "canceled", "blocked", "failed"],
  hunting: ["completed", "expired", "canceled", "failed"],
  blocked: [],
  completed: ["failed"], // only if PayPal refuses the capture
  declined: [],
  expired: [],
  canceled: [],
  failed: [],
};

export function canTransition(from: PurchaseState, to: PurchaseState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PurchaseState, to: PurchaseState): void {
  if (!canTransition(from, to)) throw new Error(`A purchase can't go from ${from} to ${to}.`);
}

export function isFinal(state: PurchaseState): boolean {
  return state === "completed" || TRANSITIONS[state].length === 0;
}

/** How long the reviewer has before a held payment is released. */
export const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long a request (nothing held yet) stays open. */
export const REQUEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A one-time purchase authorization can't outlive PayPal's 29-day authorization. */
export const OTPA_MAX_DAYS = 29;

export function reviewExpiresAt(heldAt: Date): Date {
  return new Date(heldAt.getTime() + REVIEW_WINDOW_MS);
}

/** One-Time Purchase Authorization: "find this exact product at my price, and buy it once." */
export interface Otpa {
  status: "draft" | "active" | "used";
  maxCents: number;
  /** Required details the reviewer wrote, like "size 10, black". */
  details: string;
  expiresAt: string;
  /** The product it's for. Only this product, or the same brand and model, qualifies. */
  product: { sourceId: string | null; title: string; brand: string | null; modelNumber: string | null };
  authorizationId?: string;
  usedAt?: string;
}

/** Whether a listing the shopper found qualifies under the authorization. */
export function otpaAllows(
  otpa: Otpa,
  listing: { sourceId: string; brand: string | null; modelNumber: string | null; priceCents: number; available: boolean },
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (otpa.status !== "active") return { ok: false, reason: "This authorization isn't active." };
  if (now.getTime() >= Date.parse(otpa.expiresAt)) return { ok: false, reason: "This authorization has expired." };
  const sameListing = otpa.product.sourceId !== null && otpa.product.sourceId === listing.sourceId;
  const sameModel =
    !!otpa.product.modelNumber &&
    otpa.product.modelNumber === listing.modelNumber &&
    !!otpa.product.brand &&
    otpa.product.brand.toLowerCase() === listing.brand?.toLowerCase();
  if (!sameListing && !sameModel) return { ok: false, reason: "That's a different product. Substitutions need a new approval." };
  if (!listing.available) return { ok: false, reason: "That listing is out of stock." };
  if (listing.priceCents > otpa.maxCents) return { ok: false, reason: "That's over the approved price. A higher price needs a new approval." };
  return { ok: true };
}

export interface PurchaseSummary {
  id: string;
  state: PurchaseState;
  createdAt: string;
  categories: CategoryKey[];
  /** PayPal's held amount once known, otherwise the reviewed amount. */
  amountCents: number;
}

/**
 * Past purchases as the policy engine sees them. Anything still waiting
 * (a held payment, an open request, an active authorization) reserves its
 * amount against budgets; finished ones count as spent; declined, expired
 * and canceled ones release it.
 */
export function historyFrom(purchases: PurchaseSummary[], excludeId?: string): HistoryEntry[] {
  return purchases.flatMap((p): HistoryEntry[] => {
    if (p.id === excludeId) return [];
    if (OPEN_STATES.includes(p.state)) return [{ at: p.createdAt, categories: p.categories, amountCents: p.amountCents, status: "pending_review" }];
    if (p.state === "completed") return [{ at: p.createdAt, categories: p.categories, amountCents: p.amountCents, status: "captured" }];
    return [];
  });
}

export type AfterHold =
  | { action: "capture"; decision: Decision; amount: AmountCheck & { ok: true } }
  | { action: "await_review"; decision: Decision; amount: AmountCheck & { ok: true } }
  | { action: "void"; next: "blocked" | "failed"; decision: Decision | null; amount: AmountCheck; message: string };

/**
 * PayPal has placed the hold. Check the amount it's holding, then run the
 * rules again against that amount and the latest history: rules or other
 * purchases may have changed since the shopper first looked.
 */
export function decideAfterHold(input: {
  reviewedCents: number;
  paypalAmount: { value: string; currency_code: string };
  currency?: string;
  rules: RuleSet;
  categories: CategoryKey[];
  history: HistoryEntry[];
  now: Date;
  shopperName: string;
  reviewerName: string;
  ruleOwner?: "shopper" | "reviewer";
  flow?: "hold" | "request";
}): AfterHold {
  const amount = checkPayPalAmount(input.reviewedCents, input.paypalAmount, input.currency);
  if (!amount.ok) return { action: "void", next: "failed", decision: null, amount, message: amount.message };

  const decision = evaluatePurchase(
    input.rules,
    { amountCents: amount.paypalCents, categories: input.categories },
    input.history,
    { now: input.now, shopperName: input.shopperName, reviewerName: input.reviewerName, flow: input.flow ?? "hold", ruleOwner: input.ruleOwner },
  );
  switch (decision.outcome) {
    case "auto":
      return { action: "capture", decision, amount };
    case "review":
    case "exception":
      return { action: "await_review", decision, amount };
    case "blocked":
      return { action: "void", next: "blocked", decision, amount, message: decision.reasons[0]?.message ?? "This purchase isn't allowed." };
  }
}

export type GoalVerdict = "buy" | "ask" | "no";

/** What the AI Shopper may do with a listing. Decided by code, from the rules. */
export function goalVerdict(outcome: Outcome, standingOn: boolean, priceCents: number, maxPriceCents: number | null): GoalVerdict {
  if (outcome === "blocked" || (maxPriceCents !== null && priceCents > maxPriceCents)) return "no";
  return outcome === "auto" && standingOn ? "buy" : "ask";
}
