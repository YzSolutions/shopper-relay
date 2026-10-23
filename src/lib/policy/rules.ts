import { segment, strictestBands, type BandIssue } from "./bands";
import { CATEGORY_IDS, type Cap, type CategoryKey, type CategoryRule, type RuleSet } from "./types";

/** A missing general rule is one big gap: everything goes to review. */
const UNDEFINED_RULE: CategoryRule = { bands: [] };

/** Recurring charges are reviewed unless the rules say otherwise. */
const ALWAYS_REVIEW: CategoryRule = { bands: [{ minCents: 0, maxCents: null, outcome: "review" }] };

/**
 * The rule that actually governs a category. Most (custom ones included)
 * fall back to General Shopping; subscriptions fall back to always-review.
 */
export function effectiveRule(rules: RuleSet, category: CategoryKey): CategoryRule {
  const own = rules.categories[category];
  if (own) return own;
  if (category === "subscription") return ALWAYS_REVIEW;
  return rules.categories.general ?? UNDEFINED_RULE;
}

/** Every category either rule set mentions, plus all built-in ones, in a stable order. */
export function allCategoryKeys(...sets: RuleSet[]): CategoryKey[] {
  const keys = new Set<CategoryKey>(CATEGORY_IDS);
  for (const s of sets) {
    for (const k of Object.keys(s.categories) as CategoryKey[]) keys.add(k);
    for (const k of Object.keys(s.custom ?? {}) as CategoryKey[]) keys.add(k);
  }
  return [...keys];
}

export interface RuleIssue extends BandIssue {
  category: CategoryKey;
}

/**
 * Every gap or conflict in a rule set. A rule set with issues must not go live
 * until they are resolved; until then the gaps are treated as "review".
 */
export function findRuleIssues(rules: RuleSet): RuleIssue[] {
  const categories = new Set<CategoryKey>(["general", ...(Object.keys(rules.categories) as CategoryKey[])]);
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
 * either set alone. A category whose reviewer is changing keeps its old
 * reviewer until the change takes effect.
 */
export function strictestRuleSet(a: RuleSet, b: RuleSet): RuleSet {
  const categories: RuleSet["categories"] = {};
  for (const category of allCategoryKeys(a, b)) {
    if (category !== "general" && !a.categories[category] && !b.categories[category]) continue;
    const ra = effectiveRule(a, category);
    const rb = effectiveRule(b, category);
    categories[category] = {
      bands: strictestBands(ra.bands, rb.bands),
      ...(ra.reviewer && { reviewer: ra.reviewer }),
    };
  }
  return { categories, caps: [...a.caps, ...b.caps], custom: { ...b.custom, ...a.custom } };
}
