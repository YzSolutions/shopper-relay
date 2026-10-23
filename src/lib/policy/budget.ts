import { categoryLabel, type Cap, type HistoryEntry, type RuleSet } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = { week: 7 * DAY_MS, month: 30 * DAY_MS } as const;

export interface BudgetLine {
  label: string;
  period: "week" | "month";
  limitCents: number;
  /** Paid for within the period. */
  spentCents: number;
  /** Held or requested and still waiting: reserved until it finishes or is released. */
  reservedCents: number;
  leftCents: number;
}

/** Where each weekly and monthly cap stands right now. */
export function budgetSummary(rules: RuleSet, history: HistoryEntry[], now = new Date()): BudgetLine[] {
  return rules.caps
    .filter((c): c is Cap & { period: "week" | "month" } => c.period !== "purchase")
    .map((cap) => {
      const since = now.getTime() - WINDOW_MS[cap.period];
      const inScope = history.filter((h) => Date.parse(h.at) > since && (cap.category === null || h.categories.includes(cap.category)));
      const sum = (statuses: HistoryEntry["status"][]) => inScope.filter((h) => statuses.includes(h.status)).reduce((s, h) => s + h.amountCents, 0);
      const spentCents = sum(["captured", "authorized"]);
      const reservedCents = sum(["pending_review"]);
      return {
        label: cap.category === null ? "All shopping" : categoryLabel(cap.category),
        period: cap.period,
        limitCents: cap.limitCents,
        spentCents,
        reservedCents,
        leftCents: Math.max(0, cap.limitCents - spentCents - reservedCents),
      };
    });
}
