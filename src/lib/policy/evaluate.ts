import { formatCents } from "../money";
import { segmentAt, stricter } from "./bands";
import { effectiveRule } from "./rules";
import {
  CATEGORY_LABELS,
  type Approver,
  type CategoryId,
  type HistoryEntry,
  type PurchaseStatus,
  type RuleSet,
} from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Purchases that count toward weekly totals. Pending ones count so two at once can't slip through. */
const COUNTED: PurchaseStatus[] = ["pending_review", "authorized", "captured"];

export interface PurchaseFacts {
  /** The amount PayPal holds for this order, never an AI-extracted figure. */
  amountCents: number;
  /** From resolveCategory(); every one of these rules is checked. */
  categories: CategoryId[];
}

export type ReasonCode = "band" | "undefined_range" | "weekly_limit";

export interface Reason {
  code: ReasonCode;
  category: CategoryId;
  approver: Approver;
  message: string;
}

export interface Decision {
  approver: Approver;
  /** Reasons that led to the final approver, most relevant first. */
  reasons: Reason[];
}

export interface EvaluateOptions {
  now?: Date;
  contactName?: string;
}

function rangeText(minCents: number, maxCents: number | null): string {
  if (maxCents === null) return minCents === 0 ? "of any amount" : `of ${formatCents(minCents)} and up`;
  if (minCents === 0) return `under ${formatCents(maxCents)}`;
  return `from ${formatCents(minCents)} to ${formatCents(maxCents - 1)}`;
}

export function weeklySpent(history: HistoryEntry[], category: CategoryId, now: Date): number {
  const since = now.getTime() - WEEK_MS;
  return history
    .filter((h) => COUNTED.includes(h.status) && h.categories.includes(category) && Date.parse(h.at) > since)
    .reduce((sum, h) => sum + h.amountCents, 0);
}

/**
 * Decide who approves a purchase. Pure and deterministic: the same rules,
 * facts and history always give the same answer. Every category in the facts
 * is checked and the strictest outcome wins.
 */
export function evaluatePurchase(
  rules: RuleSet,
  facts: PurchaseFacts,
  history: HistoryEntry[] = [],
  { now = new Date(), contactName = "your trusted contact" }: EvaluateOptions = {},
): Decision {
  const reasons: Reason[] = [];

  for (const category of facts.categories) {
    const rule = effectiveRule(rules, category);
    const label = CATEGORY_LABELS[category];
    const seg = segmentAt(rule.bands, facts.amountCents);
    const range = rangeText(seg.minCents, seg.maxCents);

    if (seg.approver === null) {
      reasons.push({
        code: "undefined_range",
        category,
        approver: "trusted_contact",
        message: `No rule covers ${label} purchases ${range} yet, so ${contactName} reviews it to be safe.`,
      });
      continue;
    }

    reasons.push({
      code: "band",
      category,
      approver: seg.approver,
      message:
        seg.approver === "self"
          ? `${label} purchases ${range} are yours to approve.`
          : `${label} purchases ${range} go to ${contactName} for review.`,
    });

    if (seg.approver === "self" && rule.weeklySelfLimitCents !== null) {
      const spent = weeklySpent(history, category, now);
      if (spent + facts.amountCents > rule.weeklySelfLimitCents) {
        reasons.push({
          code: "weekly_limit",
          category,
          approver: "trusted_contact",
          message: `This would bring ${label} spending this week to ${formatCents(spent + facts.amountCents)}, over your ${formatCents(rule.weeklySelfLimitCents)} weekly limit, so ${contactName} reviews it.`,
        });
      }
    }
  }

  const approver = reasons.map((r) => r.approver).reduce(stricter, "self" as Approver);
  const relevant = reasons.filter((r) => r.approver === approver);
  return { approver, reasons: relevant };
}
