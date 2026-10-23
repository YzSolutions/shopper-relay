import { formatCents } from "@/lib/money";
import { CATEGORY_IDS, CATEGORY_LABELS, type AmountBand, type Cap, type CategoryId, type Outcome, type RuleSet } from "@/lib/policy/types";

// Rules in plain words, for the person who owns them.

/** Table wording for a range; "up to" limits are stored one cent above (see rangeText in the policy engine). */
export function rangeWords(b: Pick<AmountBand, "minCents" | "maxCents">): string {
  if (b.maxCents === null) {
    if (b.minCents === 0) return "Any amount";
    return b.minCents % 100 === 1 ? `Over ${formatCents(b.minCents - 1)}` : `${formatCents(b.minCents)} and up`;
  }
  if (b.minCents === 0) return b.maxCents % 100 === 1 ? `Up to ${formatCents(b.maxCents - 1)}` : `Under ${formatCents(b.maxCents)}`;
  return `${formatCents(b.minCents)} to ${formatCents(b.maxCents - 1)}`;
}

export function outcomeWords(o: Outcome, reviewer: string): string {
  return {
    auto: "You buy on your own",
    review: `${reviewer} takes a look`,
    exception: `${reviewer} must approve an exception`,
    blocked: "Not allowed",
  }[o];
}

export interface RuleRow {
  category: CategoryId;
  label: string;
  bands: Array<{ range: string; outcome: Outcome }>;
}

/** The categories with their own rule, general first, in a stable order. */
export function ruleRows(rules: RuleSet): RuleRow[] {
  return CATEGORY_IDS.filter((c) => rules.categories[c]).map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    bands: [...rules.categories[c]!.bands].sort((a, b) => a.minCents - b.minCents).map((b) => ({ range: rangeWords(b), outcome: b.outcome })),
  }));
}

export function capWords(cap: Cap, reviewer: string): string {
  const scope = cap.category === null ? "All shopping combined" : CATEGORY_LABELS[cap.category];
  const period = { purchase: "per purchase", week: "in any 7 days", month: "in any 30 days" }[cap.period];
  return `${scope}: up to ${formatCents(cap.limitCents)} ${period}. Over that, ${outcomeWords(cap.over, reviewer).toLowerCase()}.`;
}
