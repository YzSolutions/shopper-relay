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
  findRuleIssues,
  rangeText,
  type Cap,
  type RuleIssue,
  type RuleSet,
} from "../policy";
import { generateJson } from "./gemini";

const AiRulesSchema = z.object({
  bands: z
    .array(
      z.object({
        category: z.enum(CATEGORY_IDS),
        minDollars: z.number().nonnegative().describe("inclusive lower bound"),
        maxDollars: z.number().positive().nullable().describe("exclusive upper bound; null means no upper limit"),
        outcome: z.enum(OUTCOMES),
      }),
    )
    .describe("one entry per amount range the person described"),
  caps: z.array(
    z.object({
      category: z.enum(CATEGORY_IDS).nullable().describe("null for all categories combined"),
      period: z.enum(CAP_PERIODS),
      limitDollars: z.number().positive(),
      over: z.enum(OUTCOMES),
    }),
  ),
  unclear: z.array(z.string()).describe("anything the person said that could not be turned into a rule, quoted"),
  summary: z.string().describe("the rules restated in short, plain sentences, speaking to the shopper as \"you\" and naming the reviewer, e.g. \"You buy on your own under $75. Sarah takes a look at anything over $150.\""),
});

export interface RuleNames {
  shopper: string;
  reviewer: string;
}

function systemPrompt({ shopper, reviewer }: RuleNames): string {
  const categories = CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORY_LABELS[id]}`).join("\n");
  return `You turn spending rules, written or spoken in plain English, into structured data for a shopping app.
${shopper} is the person shopping. ${reviewer} is the person who reviews purchases when the rules say so.

Outcomes:
- auto: ${shopper} can buy it without anyone else approving
- review: ${reviewer} approves or declines it
- exception: it is over a limit and ${reviewer} must knowingly approve an exception
- blocked: it cannot be bought at all

Categories (use these ids only):
${categories}

Amount ranges use minDollars (inclusive) and maxDollars (exclusive):
- "under $75" or "less than $75" -> maxDollars 75
- "up to $75" or "$75 or less" -> maxDollars 75.01
- "$75 or more", "$75+", "$75 and up" -> minDollars 75
- "over $150" or "more than $150" -> minDollars 150.01
- "always" or "any amount" -> minDollars 0, maxDollars null

Rules:
- Only write down what the person actually said. Never invent a range, limit or category they did not mention, and never fill a gap with a guess.
- "Subscriptions", "memberships" and "recurring charges" all mean the subscription category.
- Weekly or monthly totals ("no more than $30 a week") are caps, not bands. "Per purchase" limits across everything are caps with period "purchase".
- If something is unclear, quote it in "unclear" instead of guessing.`;
}

function toRuleSet(ai: z.infer<typeof AiRulesSchema>): RuleSet {
  const categories: RuleSet["categories"] = {};
  for (const b of ai.bands) {
    (categories[b.category] ??= { bands: [] }).bands.push({
      minCents: numberToCents(b.minDollars),
      maxCents: b.maxDollars === null ? null : numberToCents(b.maxDollars),
      outcome: b.outcome,
    });
  }
  const caps: Cap[] = ai.caps.map((c) => ({ category: c.category, period: c.period, limitCents: numberToCents(c.limitDollars), over: c.over }));
  return { categories, caps };
}

/** New rules replace the categories and caps they mention; everything else stays as it was. */
export function mergeRules(current: RuleSet, update: RuleSet): RuleSet {
  const updatedCaps = new Set(update.caps.map(capKey));
  return {
    categories: { ...current.categories, ...update.categories },
    caps: [...current.caps.filter((c) => !updatedCaps.has(capKey(c))), ...update.caps],
  };
}

/** The question to ask the rule owner for each gap or conflict. Written by code, not the AI. */
export function questionFor(issue: RuleIssue, { reviewer }: RuleNames): string {
  const label = CATEGORY_LABELS[issue.category];
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
    task: "parse-rules",
    schema: AiRulesSchema,
    system: systemPrompt(names),
    parts: [{ text }],
  });
  const update = toRuleSet(data);
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
