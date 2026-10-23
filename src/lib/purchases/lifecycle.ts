// The purchase lifecycle, kept pure so every rule about it can be tested
// without PayPal or a database.
//
//   evaluated ──► checkout ──► (hold placed) ──► completed            outcome "auto"
//       │             │                 └──────► awaiting_review ──► completed | declined | expired
//       ▼             └──► failed (amount mismatch, PayPal error)    outcome "review" / "exception"
//    blocked          └──► blocked (rules changed before the hold)
//
// Any hold that doesn't end in "completed" is voided, so nothing is charged.

import {
  checkPayPalAmount,
  evaluatePurchase,
  type AmountCheck,
  type CategoryId,
  type Decision,
  type HistoryEntry,
  type RuleSet,
} from "../policy";

export const PURCHASE_STATES = [
  "evaluated",
  "blocked",
  "checkout",
  "awaiting_review",
  "completed",
  "declined",
  "expired",
  "canceled",
  "failed",
] as const;
export type PurchaseState = (typeof PURCHASE_STATES)[number];

const TRANSITIONS: Record<PurchaseState, PurchaseState[]> = {
  evaluated: ["checkout", "blocked", "canceled"],
  checkout: ["completed", "awaiting_review", "blocked", "failed", "canceled"],
  awaiting_review: ["completed", "declined", "expired", "canceled", "failed"],
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

export function reviewExpiresAt(heldAt: Date): Date {
  return new Date(heldAt.getTime() + REVIEW_WINDOW_MS);
}

export interface PurchaseSummary {
  id: string;
  state: PurchaseState;
  createdAt: string;
  categories: CategoryId[];
  /** PayPal's held amount once known, otherwise the reviewed amount. */
  amountCents: number;
}

/**
 * Past purchases as the policy engine sees them. Held payments waiting for
 * review count against budgets; finished ones count as spent; anything that
 * never held money doesn't count.
 */
export function historyFrom(purchases: PurchaseSummary[], excludeId?: string): HistoryEntry[] {
  return purchases.flatMap((p): HistoryEntry[] => {
    if (p.id === excludeId) return [];
    if (p.state === "awaiting_review") return [{ at: p.createdAt, categories: p.categories, amountCents: p.amountCents, status: "pending_review" }];
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
  categories: CategoryId[];
  history: HistoryEntry[];
  now: Date;
  shopperName: string;
  reviewerName: string;
}): AfterHold {
  const amount = checkPayPalAmount(input.reviewedCents, input.paypalAmount, input.currency);
  if (!amount.ok) return { action: "void", next: "failed", decision: null, amount, message: amount.message };

  const decision = evaluatePurchase(
    input.rules,
    { amountCents: amount.paypalCents, categories: input.categories },
    input.history,
    { now: input.now, shopperName: input.shopperName, reviewerName: input.reviewerName },
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
