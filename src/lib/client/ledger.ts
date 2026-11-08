import { categoryLabel, type CategoryKey, type Outcome } from "@/lib/policy/types";
import type { PurchaseState } from "@/lib/purchases/lifecycle";

// The spending table on History: one row per purchase that went anywhere, in plain words.

export interface LedgerPurchase {
  id: string;
  state: PurchaseState;
  flow: "hold" | "request";
  createdAt: string;
  item: { title: string };
  category: { primary: CategoryKey };
  decision: { outcome: Outcome };
  reviewerName: string | null;
  reviewedCents: number;
  paypalCapturedCents: number | null;
  standing: boolean;
  otpa: { maxCents: number } | null;
  paypal: { authorizationId: string | null; captureId: string | null };
}

export interface LedgerRow {
  id: string;
  date: Date;
  item: string;
  category: string;
  /** What PayPal charged once paid; otherwise the price asked about. */
  amount: number;
  status: LedgerStatus;
  decidedBy: string;
  paypalId: string;
  paid: boolean;
}

export type LedgerStatus = "Paid" | "Held" | "Waiting" | "Declined" | "Released" | "Not allowed" | "Stopped";

const STATUS: Partial<Record<PurchaseState, LedgerStatus>> = {
  completed: "Paid",
  awaiting_review: "Held",
  hunting: "Held",
  requested: "Waiting",
  declined: "Declined",
  expired: "Released",
  canceled: "Released",
  blocked: "Not allowed",
  failed: "Stopped",
};

/** Who settled it, or who it waits for. */
function decidedBy(p: LedgerPurchase, names: { shopper: string; reviewer: string }): string {
  const reviewer = p.reviewerName ?? names.reviewer;
  if (p.state === "completed") {
    if (p.otpa) return `${reviewer}'s one-time limit`;
    if (p.standing) return `${reviewer}'s saved PayPal`;
    if (p.decision.outcome === "auto") return `${names.shopper}'s own rules`;
    return reviewer;
  }
  if (p.state === "declined") return reviewer;
  if (p.state === "expired") return "No answer in time";
  if (p.state === "canceled") return `${names.shopper} canceled`;
  if (p.state === "blocked") return "The rules";
  if (p.state === "failed") return "PayPal check";
  return `Waiting for ${reviewer}`;
}

/** Purchases that were only looked at (never paid for or sent) aren't spending, so they're left out. */
export function ledgerRows(purchases: LedgerPurchase[], names: { shopper: string; reviewer: string }): LedgerRow[] {
  return purchases.flatMap((p) => {
    const status = STATUS[p.state];
    if (!status) return [];
    const paid = p.state === "completed";
    return [
      {
        id: p.id,
        date: new Date(p.createdAt),
        item: p.item.title,
        category: categoryLabel(p.category.primary),
        amount: (paid ? (p.paypalCapturedCents ?? p.reviewedCents) : p.reviewedCents) / 100,
        status,
        decidedBy: decidedBy(p, names),
        paypalId: p.paypal.captureId ?? p.paypal.authorizationId ?? "",
        paid,
      },
    ];
  });
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** What was actually paid in the last 30 days, the window the monthly limits use. */
export function paidLately(rows: LedgerRow[], now = new Date()): number {
  const cents = rows.filter((r) => r.paid && now.getTime() - r.date.getTime() <= MONTH_MS).reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
  return cents / 100;
}
