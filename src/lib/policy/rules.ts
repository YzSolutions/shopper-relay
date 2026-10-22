import { segment, strictestBands, type BandIssue } from "./bands";
import { CATEGORY_IDS, type Cap, type CategoryId, type CategoryRule, type RuleSet } from "./types";

/** A missing general rule is one big gap: everything goes to review. */
const UNDEFINED_RULE: CategoryRule = { bands: [] };

/** Recurring charges are reviewed unless the rules say otherwise. */
const ALWAYS_REVIEW: CategoryRule = { bands: [{ minCents: 0, maxCents: null, outcome: "review" }] };

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
 * until they are resolved; until then the gaps are treated as "review".
 */
export function findRuleIssues(rules: RuleSet): RuleIssue[] {
  const categories = new Set<CategoryId>(["general", ...(Object.keys(rules.categories) as CategoryId[])]);
  return [...categories].flatMap((category) =>
    segment(rules.categories[category]?.bands ?? []).issues.map((issue) => ({ ...issue, category })),
  );
}

/** Caps that limit the same thing: same category (or all) over the same period. */
export function capKey(cap: Cap): string {
  return `${cap.category ?? "*"}/${cap.period}`;
}

/**
 * The pointwise-strictest of two rule sets: what applies while a loosening
 * waits. Every cap from both sets applies, which is at least as strict as
 * either set alone.
 */
export function strictestRuleSet(a: RuleSet, b: RuleSet): RuleSet {
  const categories: RuleSet["categories"] = {};
  for (const category of CATEGORY_IDS) {
    if (category !== "general" && !a.categories[category] && !b.categories[category]) continue;
    categories[category] = { bands: strictestBands(effectiveRule(a, category).bands, effectiveRule(b, category).bands) };
  }
  return { categories, caps: [...a.caps, ...b.caps] };
}
