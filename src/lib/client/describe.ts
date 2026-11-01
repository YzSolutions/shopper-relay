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

/**
 * `shopper` words it for someone else (the reviewer's phone): "Mom buys without asking".
 * `payer` is whose saved PayPal pays when the shopper buys on their own; a
 * category's own reviewer never pays.
 */
export function outcomeWords(o: Outcome, reviewer: string, flow: "hold" | "request" = "hold", shopper?: string, payer = reviewer): string {
  return {
    // Where the reviewer pays, "on your own" means with the payer's standing permission.
    auto: shopper ? `${shopper} buys without asking` : flow === "request" ? `You buy, ${payer} pays` : "You buy on your own",
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
  const then = cap.over === "exception" ? `${reviewer} must approve an exception` : lowerFirst(outcomeWords(cap.over, reviewer, flow));
  return `${scope}: up to ${formatCents(cap.limitCents)} ${period}. Over that, ${then}.`;
}

/** One line of a rule change: what a category (or the spending limits) said before and after. */
export interface RuleDiffLine {
  label: string;
  before: string;
  after: string;
}

// Lowercase only a leading "You"/"Over", never a name.
const lowerFirst = (s: string) => (/^(You|Over|Any|Not)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

const OWN_RULE_NONE = "No rule of its own. General Shopping applies.";

function rowWords(row: RuleRow, reviewer: string, flow: "hold" | "request", shopper?: string): string {
  const bands = row.bands.map((b) => `${b.range}: ${lowerFirst(outcomeWords(b.outcome, row.reviewer ?? reviewer, flow, shopper, reviewer))}`).join(". ");
  return row.reviewer ? `${bands}. Reviewed by ${row.reviewer}.` : `${bands}.`;
}

/** What changed between two rule sets, category by category, in the words the rules table uses. */
export function ruleDiff(before: RuleSet, after: RuleSet, reviewer: string, flow: "hold" | "request" = "hold", shopper?: string): RuleDiffLine[] {
  const was = new Map(ruleRows(before).map((r) => [r.category, r]));
  const now = new Map(ruleRows(after).map((r) => [r.category, r]));
  const lines: RuleDiffLine[] = [];
  for (const category of allCategoryKeys(before, after)) {
    const a = was.get(category);
    const b = now.get(category);
    const aw = a ? rowWords(a, reviewer, flow, shopper) : null;
    const bw = b ? rowWords(b, reviewer, flow, shopper) : null;
    if (aw !== bw) lines.push({ label: (a ?? b)!.label, before: aw ?? OWN_RULE_NONE, after: bw ?? OWN_RULE_NONE });
  }
  const capsBefore = before.caps.map((c) => capWords(c, reviewer, flow));
  const capsAfter = after.caps.map((c) => capWords(c, reviewer, flow));
  const gone = capsBefore.filter((c) => !capsAfter.includes(c));
  const added = capsAfter.filter((c) => !capsBefore.includes(c));
  if (gone.length || added.length) lines.push({ label: "Spending limits", before: gone.join(" ") || "None.", after: added.join(" ") || "None." });
  return lines;
}
