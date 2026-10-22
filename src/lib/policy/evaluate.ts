import { formatCents } from "../money";
import { GAP_OUTCOME, segmentAt, stricter } from "./bands";
import { effectiveRule } from "./rules";
import {
  CATEGORY_LABELS,
  type Cap,
  type CategoryId,
  type HistoryEntry,
  type Outcome,
  type PurchaseStatus,
  type RuleSet,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = { week: 7 * DAY_MS, month: 30 * DAY_MS } as const;
const PERIOD_TEXT = { purchase: "per-purchase", week: "weekly", month: "monthly" } as const;

/** Purchases that use up a budget. Pending ones count, so two at once can't slip through. */
const COUNTED: PurchaseStatus[] = ["pending_review", "authorized", "captured"];

export interface PurchaseFacts {
  /** The full amount PayPal holds for this order (shipping and tax included), never an AI-extracted figure. */
  amountCents: number;
  /** From resolveCategory(); every one of these rules is checked. */
  categories: CategoryId[];
}

export type ReasonCode = "band" | "undefined_range" | "cap";

export interface Reason {
  code: ReasonCode;
  category: CategoryId | null;
  outcome: Outcome;
  message: string;
}

export interface Decision {
  outcome: Outcome;
  /** The reasons behind the final outcome, in the order they were found. */
  reasons: Reason[];
}

export interface EvaluateOptions {
  now?: Date;
  shopperName?: string;
  reviewerName?: string;
}

function rangeText(minCents: number, maxCents: number | null): string {
  if (maxCents === null) return minCents === 0 ? "of any amount" : `of ${formatCents(minCents)} and up`;
  if (minCents === 0) return `under ${formatCents(maxCents)}`;
  return `from ${formatCents(minCents)} to ${formatCents(maxCents - 1)}`;
}

function consequence(outcome: Outcome, shopper: string, reviewer: string): string {
  switch (outcome) {
    case "auto":
      return `${shopper} can buy without waiting for approval`;
    case "review":
      return `${reviewer} reviews it`;
    case "exception":
      return `${reviewer} must approve an exception`;
    case "blocked":
      return `it can't be bought unless ${reviewer} changes the rules`;
  }
}

/** Total of counted purchases within the period that fall under the cap. */
export function spentWithin(history: HistoryEntry[], cap: Cap, now: Date): number {
  if (cap.period === "purchase") return 0;
  const since = now.getTime() - PERIOD_MS[cap.period];
  return history
    .filter((h) => COUNTED.includes(h.status) && Date.parse(h.at) > since)
    .filter((h) => cap.category === null || h.categories.includes(cap.category))
    .reduce((sum, h) => sum + h.amountCents, 0);
}

/**
 * Decide what happens to a purchase. Pure and deterministic: the same rules,
 * facts and history always give the same answer. Every category's bands and
 * every relevant cap are checked, and the most restrictive outcome wins.
 */
export function evaluatePurchase(
  rules: RuleSet,
  facts: PurchaseFacts,
  history: HistoryEntry[] = [],
  { now = new Date(), shopperName = "the shopper", reviewerName = "the reviewer" }: EvaluateOptions = {},
): Decision {
  const reasons: Reason[] = [];
  const then = (outcome: Outcome) => consequence(outcome, shopperName, reviewerName);

  for (const category of facts.categories) {
    const label = CATEGORY_LABELS[category];
    const seg = segmentAt(effectiveRule(rules, category).bands, facts.amountCents);
    const range = rangeText(seg.minCents, seg.maxCents);
    if (seg.outcome === null) {
      reasons.push({
        code: "undefined_range",
        category,
        outcome: GAP_OUTCOME,
        message: `No rule covers ${label} purchases ${range} yet, so ${then(GAP_OUTCOME)} to be safe.`,
      });
    } else {
      reasons.push({ code: "band", category, outcome: seg.outcome, message: `${label} purchases ${range}: ${then(seg.outcome)}.` });
    }
  }

  for (const cap of rules.caps) {
    if (cap.category !== null && !facts.categories.includes(cap.category)) continue;
    const total = spentWithin(history, cap, now) + facts.amountCents;
    if (total <= cap.limitCents) continue;
    const scope = cap.category === null ? "" : `${CATEGORY_LABELS[cap.category]} `;
    const message =
      cap.period === "purchase"
        ? `${formatCents(total)} is over the ${formatCents(cap.limitCents)} ${scope}per-purchase limit, so ${then(cap.over)}.`
        : `This would bring ${scope}spending in the last ${cap.period === "week" ? "7" : "30"} days to ${formatCents(total)}, over the ${formatCents(cap.limitCents)} ${scope}${PERIOD_TEXT[cap.period]} limit, so ${then(cap.over)}.`;
    reasons.push({ code: "cap", category: cap.category, outcome: cap.over, message });
  }

  const outcome = reasons.map((r) => r.outcome).reduce(stricter, "auto");
  return { outcome, reasons: reasons.filter((r) => r.outcome === outcome) };
}
