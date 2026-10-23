import { formatCents } from "@/lib/money";
import { allCategoryKeys } from "@/lib/policy/rules";
import { categoryLabel, type AmountBand, type Cap, type CategoryKey, type Outcome, type RuleSet } from "@/lib/policy/types";

// Rules in plain words, for the person who owns them.

/** Table wording for a range; "up to" limits are stored one cent above (see rangeText in the policy engine). */
export function rangeWords(b: Pick<AmountBand, "minCents" | "maxCents">): string {
  if (b.maxCents === null) {
    if (b.minCents === 0) return "Any amount";
    return b.minCents % 100 === 1 ? `Over ${formatCents(b.minCents - 1)}` : `${formatCents(b.minCents)} and up`;
  }
  if (b.maxCents - b.minCents === 1) return `Exactly ${formatCents(b.minCents)}`;
  if (b.minCents === 0) return b.maxCents % 100 === 1 ? `Up to ${formatCents(b.maxCents - 1)}` : `Under ${formatCents(b.maxCents)}`;
  return `${formatCents(b.minCents)} to ${formatCents(b.maxCents - 1)}`;
}

export function outcomeWords(o: Outcome, reviewer: string, flow: "hold" | "request" = "hold"): string {
  return {
    auto: "You buy on your own",
    review: flow === "hold" ? `${reviewer} takes a look` : `${reviewer} decides`,
    exception: flow === "hold" ? `${reviewer} must approve an exception` : `Over budget: ${reviewer} decides`,
    blocked: "Not allowed",
  }[o];
}

export interface RuleRow {
  category: CategoryKey;
  label: string;
  /** The words that identify a custom category, shown under its name. */
  matches: string[] | null;
  reviewer: string | null;
  bands: Array<{ range: string; outcome: Outcome }>;
}

/** The categories with their own rule, general first, custom ones last. */
export function ruleRows(rules: RuleSet): RuleRow[] {
  return allCategoryKeys(rules)
    .filter((c) => rules.categories[c])
    .map((c) => ({
      category: c,
      label: categoryLabel(c),
      matches: rules.custom?.[c as keyof NonNullable<RuleSet["custom"]>]?.match ?? null,
      reviewer: rules.categories[c]!.reviewer ?? null,
      bands: [...rules.categories[c]!.bands].sort((a, b) => a.minCents - b.minCents).map((b) => ({ range: rangeWords(b), outcome: b.outcome })),
    }));
}

export function capWords(cap: Cap, reviewer: string, flow: "hold" | "request" = "hold"): string {
  const scope = cap.category === null ? "All shopping combined" : categoryLabel(cap.category);
  const period = { purchase: "per purchase", week: "in any 7 days", month: "in any 30 days" }[cap.period];
  const then = outcomeWords(cap.over, reviewer, flow);
  return `${scope}: up to ${formatCents(cap.limitCents)} ${period}. Over that: ${then}.`;
}
