import { segment, strictestBands, type BandIssue } from "./bands";
import { CATEGORY_IDS, type CategoryId, type CategoryRule, type RuleSet } from "./types";

/** A missing general rule is one big gap: everything goes to review. */
const UNDEFINED_RULE: CategoryRule = { bands: [], weeklySelfLimitCents: null };

/** Recurring charges are reviewed unless the owner has said otherwise. */
const ALWAYS_REVIEW: CategoryRule = {
  bands: [{ minCents: 0, maxCents: null, approver: "trusted_contact" }],
  weeklySelfLimitCents: null,
};

/**
 * The rule that actually governs a category. Most fall back to General
 * Shopping; subscriptions fall back to always-review.
 */
export function effectiveRule(rules: RuleSet, category: CategoryId): CategoryRule {
  const own = rules.categories[category];
  if (own) return own;
  if (category === "subscription") return ALWAYS_REVIEW;
  return rules.categories.general ?? UNDEFINED_RULE;
}

export interface RuleIssue extends BandIssue {
  category: CategoryId;
}

/**
 * Every gap or conflict in a rule set. A rule set with issues must not go live
 * until the owner resolves them; until then the gaps are treated as "review".
 */
export function findRuleIssues(rules: RuleSet): RuleIssue[] {
  const categories = new Set<CategoryId>(["general", ...(Object.keys(rules.categories) as CategoryId[])]);
  return [...categories].flatMap((category) =>
    segment(rules.categories[category]?.bands ?? []).issues.map((issue) => ({ ...issue, category })),
  );
}

function minLimit(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** The pointwise-strictest of two rule sets: what applies while a loosening waits. */
export function strictestRuleSet(a: RuleSet, b: RuleSet): RuleSet {
  const categories: RuleSet["categories"] = {};
  for (const category of CATEGORY_IDS) {
    if (category !== "general" && !a.categories[category] && !b.categories[category]) continue;
    const ra = effectiveRule(a, category);
    const rb = effectiveRule(b, category);
    categories[category] = {
      bands: strictestBands(ra.bands, rb.bands),
      weeklySelfLimitCents: minLimit(ra.weeklySelfLimitCents, rb.weeklySelfLimitCents),
    };
  }
  return { categories };
}
