// Plain-English spending rules -> structured rules. The AI only translates;
// gaps and conflicts are found by the policy engine, and the questions back to
// the rule owner are written by code, so nothing ambiguous can go live.

import { z } from "zod";
import { numberToCents } from "../money";
import {
  CAP_PERIODS,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  OUTCOMES,
  capKey,
  categoryLabel,
  customCategoryKey,
  effectiveRule,
  findRuleIssues,
  isCustomCategory,
  rangeText,
  type Cap,
  type CategoryKey,
  type CategoryRule,
  type RuleIssue,
  type RuleSet,
} from "../policy";
import { generateJson } from "./gemini";

const CategoryName = z.string().describe("a category id from the list, or the short name of a new category the person made up, like \"Cars\"");

const AiRulesSchema = z.object({
  bands: z
    .array(
      z.object({
        category: CategoryName,
        minDollars: z.number().nonnegative().describe("inclusive lower bound"),
        maxDollars: z.number().positive().nullable().describe("exclusive upper bound; null means no upper limit"),
        outcome: z.enum(OUTCOMES),
      }),
    )
    .describe("one entry per amount range the person described"),
  caps: z.array(
    z.object({
      category: CategoryName.nullable().describe("null for all categories combined"),
      period: z.enum(CAP_PERIODS),
      limitDollars: z.number().positive(),
      over: z.enum(OUTCOMES),
    }),
  ),
  newCategories: z
    .array(
      z.object({
        name: z.string().describe("short name, capitalized, e.g. \"Cars\""),
        matchWords: z.array(z.string()).min(1).max(10).describe("words that identify these products in a store's category or a product name, singular, e.g. [\"car\", \"vehicle\", \"automobile\", \"truck\"]"),
      }),
    )
    .describe("categories the person mentioned that are not in the list"),
  reviewers: z
    .array(z.object({ category: CategoryName, reviewer: z.string().describe("first name only, e.g. \"Tom\"") }))
    .describe("only when the person says someone other than the usual reviewer should review a category"),
  unclear: z.array(z.string()).describe("anything the person said that could not be turned into a rule, quoted"),
  summary: z
    .string()
    .describe('the rules restated in short, plain sentences, speaking to the shopper as "you" and naming the reviewer, e.g. "You buy on your own under $75. Sarah takes a look at anything over $150."'),
});
type AiRules = z.infer<typeof AiRulesSchema>;

export interface RuleNames {
  shopper: string;
  reviewer: string;
}

function systemPrompt({ shopper, reviewer }: RuleNames): string {
  const categories = CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORY_LABELS[id]}`).join("\n");
  return `You turn spending rules, written or spoken in plain English, into structured data for a shopping app.
${shopper} is the person shopping. ${reviewer} usually reviews purchases when the rules say so.

Outcomes:
- auto: ${shopper} can buy it without anyone else approving
- review: someone approves or declines it
- exception: it is over a limit and someone must knowingly approve an exception
- blocked: it cannot be bought at all

Categories:
${categories}
If the person names a kind of purchase that isn't in this list (for example cars, pet supplies, garden tools), use its own short name as the category and add it to newCategories with words that identify it. Don't squeeze it into general.

Amount ranges use minDollars (inclusive) and maxDollars (exclusive):
- "under $75" or "less than $75" -> maxDollars 75
- "up to $75" or "$75 or less" -> maxDollars 75.01
- "$75 or more", "$75+", "$75 and up" -> minDollars 75
- "over $150", "more than $150", "over that" (after "under $150") -> minDollars 150.01
- "always" or "any amount" -> minDollars 0, maxDollars null
Plain numbers like "10000" are dollars.

Rules:
- Only write down what the person actually said. Never invent a range, limit or category they did not mention, and never fill a gap with a guess.
- "Subscriptions", "memberships" and "recurring charges" all mean the subscription category.
- Weekly or monthly totals ("no more than $30 a week") are caps, not bands. "Per purchase" limits across everything are caps with period "purchase".
- If they say a different person should review a category ("video games go to Dad, Tom"), add it to reviewers with that person's first name. Typos in names are likely: "sarag" means ${reviewer}.
- If something is unclear, quote only that part in "unclear" instead of guessing.`;
}

/** Map the AI's category name to a key: a built-in id or label, otherwise a custom category. */
function toKey(name: string): CategoryKey {
  const n = name.trim();
  const lower = n.toLowerCase();
  const builtIn = CATEGORY_IDS.find((id) => id === lower || CATEGORY_LABELS[id].toLowerCase() === lower);
  if (builtIn) return builtIn;
  if (isCustomCategory(n)) return n;
  return customCategoryKey(n);
}

function toUpdate(ai: AiRules, current: RuleSet): RuleSet {
  const categories: RuleSet["categories"] = {};
  for (const b of ai.bands) {
    (categories[toKey(b.category)] ??= { bands: [] }).bands.push({
      minCents: numberToCents(b.minDollars),
      maxCents: b.maxDollars === null ? null : numberToCents(b.maxDollars),
      outcome: b.outcome,
    });
  }
  // A new reviewer for a category keeps that category's limits as they are.
  for (const r of ai.reviewers) {
    const key = toKey(r.category);
    const rule: CategoryRule = categories[key] ?? { bands: effectiveRule(current, key).bands };
    categories[key] = { ...rule, reviewer: r.reviewer.trim() };
  }
  const caps: Cap[] = ai.caps.map((c) => ({
    category: c.category === null ? null : toKey(c.category),
    period: c.period,
    limitCents: numberToCents(c.limitDollars),
    over: c.over,
  }));
  const custom: NonNullable<RuleSet["custom"]> = {};
  for (const c of ai.newCategories) {
    const key = toKey(c.name);
    if (!isCustomCategory(key)) continue;
    const words = [...new Set([c.name, ...c.matchWords].map((w) => w.trim().toLowerCase()).filter((w) => w.length > 1))].slice(0, 20);
    custom[key] = { match: words };
  }
  // A custom category used without matchWords still needs at least its own name.
  for (const key of Object.keys(categories) as CategoryKey[]) {
    if (isCustomCategory(key) && !custom[key] && !current.custom?.[key]) custom[key] = { match: [categoryLabel(key).toLowerCase()] };
  }
  return { categories, caps, ...(Object.keys(custom).length && { custom }) };
}

/** New rules replace the categories and caps they mention; everything else stays as it was. */
export function mergeRules(current: RuleSet, update: RuleSet): RuleSet {
  const updatedCaps = new Set(update.caps.map(capKey));
  const categories: RuleSet["categories"] = { ...current.categories };
  for (const [key, rule] of Object.entries(update.categories) as Array<[CategoryKey, CategoryRule]>) {
    // Keep an existing reviewer unless this change names a new one.
    const reviewer = rule.reviewer ?? current.categories[key]?.reviewer;
    categories[key] = { ...rule, ...(reviewer && { reviewer }) };
  }
  const custom = { ...current.custom, ...update.custom };
  return {
    categories,
    caps: [...current.caps.filter((c) => !updatedCaps.has(capKey(c))), ...update.caps],
    ...(Object.keys(custom).length && { custom }),
  };
}

/** The question to ask the rule owner for each gap or conflict. Written by code, not the AI. */
export function questionFor(issue: RuleIssue, { reviewer }: RuleNames): string {
  const label = categoryLabel(issue.category);
  const range = rangeText(issue.minCents, issue.maxCents);
  if (issue.kind === "gap") {
    if (issue.category === "general" && issue.minCents === 0 && issue.maxCents === null) {
      return `What should happen with everyday purchases that don't fit another category? Until you decide, ${reviewer} reviews them.`;
    }
    return `What should happen with ${label} purchases ${range}? Until you decide, ${reviewer} reviews them.`;
  }
  return `Two of your ${label} rules disagree for purchases ${range}. Which one should apply? Until you decide, the stricter one does.`;
}

export interface ParsedRules {
  /** The rules as they would be after this change. */
  rules: RuleSet;
  /** Only what was mentioned in this message. */
  update: RuleSet;
  issues: RuleIssue[];
  questions: string[];
  unclear: string[];
  summary: string;
  model: string;
}

export async function parseRules(text: string, names: RuleNames, current: RuleSet = { categories: {}, caps: [] }): Promise<ParsedRules> {
  const { data, model } = await generateJson({
    task: "parse-rules-v2",
    schema: AiRulesSchema,
    system: systemPrompt(names),
    parts: [{ text }],
  });
  const update = toUpdate(data, current);
  const rules = mergeRules(current, update);
  const issues = findRuleIssues(rules);
  return {
    rules,
    update,
    issues,
    questions: issues.map((i) => questionFor(i, names)),
    unclear: data.unclear,
    summary: data.summary,
    model,
  };
}
