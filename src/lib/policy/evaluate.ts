import { formatCents } from "../money";
import { GAP_OUTCOME, segmentAt, stricter } from "./bands";
import { effectiveRule } from "./rules";
import {
  categoryLabel,
  isCustomCategory,
  type Cap,
  type CategoryId,
  type CategoryKey,
  type HistoryEntry,
  type Outcome,
  type PurchaseStatus,
  type RuleSet,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = { week: 7 * DAY_MS, month: 30 * DAY_MS } as const;
const PERIOD_TEXT = { purchase: "per-purchase", week: "weekly", month: "monthly" } as const;

/** Purchases that use up a budget. Pending ones count, so two at once can't slip through. */
const COUNTED: PurchaseStatus[] = ["pending_review", "authorized", "captured"];

export interface PurchaseFacts {
  /** The full amount PayPal holds for this order (shipping and tax included), never an AI-extracted figure. */
  amountCents: number;
  /** From resolveCategory(); every one of these rules is checked. */
  categories: CategoryKey[];
}

export type ReasonCode = "band" | "undefined_range" | "cap";

export interface Reason {
  code: ReasonCode;
  category: CategoryKey | null;
  outcome: Outcome;
  /** Who reviews because of this reason (a category's own reviewer, or the main one). */
  reviewer: string;
  message: string;
}

export interface Decision {
  outcome: Outcome;
  /** The reasons behind the final outcome, in the order they were found. */
  reasons: Reason[];
  /**
   * Who is asked, when the outcome needs someone: the category's own
   * reviewer if every reason agrees on one, otherwise the main reviewer.
   */
  reviewer: string;
}

export interface EvaluateOptions {
  now?: Date;
  shopperName?: string;
  reviewerName?: string;
  /**
   * hold: the shopper pays and the reviewer takes a look.
   * request: the reviewer decides and pays. Changes only the words.
   */
  flow?: "hold" | "request";
  /** Who can change the rules: the shopper (their own safeguards) or the main reviewer. */
  ruleOwner?: "shopper" | "reviewer";
}

/** The names and setup the reasons are written for. */
interface Words {
  shopper: string;
  /** Whoever is asked about this purchase. */
  reviewer: string;
  flow: "hold" | "request";
  /** The person who can change the rules. */
  owner: string;
  ownerIsShopper: boolean;
}

/**
 * A range in words. Limits written as "up to $15" are stored one cent above
 * ($15.01 exclusive), so ranges ending or starting on an odd cent read as
 * "up to $15.00" and "over $15.00" rather than "under $15.01".
 */
export function rangeText(minCents: number, maxCents: number | null): string {
  const upTo = maxCents !== null && maxCents % 100 === 1;
  const over = minCents % 100 === 1;
  if (maxCents === null) {
    if (minCents === 0) return "of any amount";
    return over ? `over ${formatCents(minCents - 1)}` : `of ${formatCents(minCents)} and up`;
  }
  if (maxCents - minCents === 1) return `of exactly ${formatCents(minCents)}`;
  if (minCents === 0) return upTo ? `up to ${formatCents(maxCents - 1)}` : `under ${formatCents(maxCents)}`;
  return `from ${formatCents(minCents)} to ${formatCents(maxCents - 1)}`;
}

/** How a built-in category reads inside a sentence. */
const PHRASES: Record<CategoryId, string> = {
  general: "everyday purchases",
  food: "food and grocery purchases",
  clothing: "clothing purchases",
  shoes_handbags: "shoe and handbag purchases",
  medical_device: "medical device purchases",
  medical_visit: "medical visits",
  toys: "toy purchases",
  video_games: "video game purchases",
  books: "book purchases",
  school_supplies: "school supply purchases",
  electronics: "electronics purchases",
  gifts: "gifts",
  home_decor: "home and décor purchases",
  collectibles: "collectible purchases",
  subscription: "subscriptions and other repeat charges",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function phraseFor(category: CategoryKey): string {
  return isCustomCategory(category) ? `purchases in ${categoryLabel(category)}` : PHRASES[category];
}

/** Who can lift a block: the shopper's own rules, or the owner changing them. */
const notAllowed = (w: Words) => (w.ownerIsShopper ? `${w.shopper}'s own rules don't allow it` : `it can't be bought unless ${w.owner} changes the rules`);

/** One plain sentence about a category rule, e.g. "Sarah takes a look at medical device purchases of $100.00 and up." */
function bandSentence(outcome: Outcome, category: CategoryKey, range: string, w: Words): string {
  const what = phraseFor(category);
  switch (outcome) {
    case "auto":
      return `${w.shopper} can make ${what} ${range} without waiting for anyone.`;
    case "review":
      return w.flow === "request" ? `${w.reviewer} decides on ${what} ${range}.` : `${w.reviewer} takes a look at ${what} ${range}.`;
    case "exception":
      return `${capitalize(what)} ${range} are over the limit, so ${w.reviewer} must approve an exception.`;
    case "blocked":
      return w.ownerIsShopper
        ? `${capitalize(what)} ${range} aren't allowed under ${w.shopper}'s own rules.`
        : `${capitalize(what)} ${range} aren't allowed unless ${w.owner} changes the rules.`;
  }
}

function consequence(outcome: Outcome, w: Words): string {
  switch (outcome) {
    case "auto":
      return `${w.shopper} can buy it without waiting`;
    case "review":
      return w.flow === "request" ? `${w.reviewer} decides` : `${w.reviewer} takes a look`;
    case "exception":
      return `${w.reviewer} must approve an exception`;
    case "blocked":
      return notAllowed(w);
  }
}

/** Total of counted purchases within the period that fall under the cap. */
export function spentWithin(history: HistoryEntry[], cap: Cap, now: Date): number {
  if (cap.period === "purchase") return 0;
  const since = now.getTime() - PERIOD_MS[cap.period];
  return history
    .filter((h) => COUNTED.includes(h.status) && Date.parse(h.at) > since)
    .filter((h) => cap.category === null || h.categories.includes(cap.category))
    .reduce((sum, h) => sum + h.amountCents, 0);
}

/**
 * Decide what happens to a purchase. Pure and deterministic: the same rules,
 * facts and history always give the same answer. Every category's bands and
 * every relevant cap are checked, and the most restrictive outcome wins.
 */
export function evaluatePurchase(
  rules: RuleSet,
  facts: PurchaseFacts,
  history: HistoryEntry[] = [],
  { now = new Date(), shopperName = "the shopper", reviewerName = "the reviewer", flow = "hold", ruleOwner = "reviewer" }: EvaluateOptions = {},
): Decision {
  // Each reason is written once the person asked is known, so every sentence names them.
  const found: Array<Omit<Reason, "message"> & { say: (w: Words) => string }> = [];
  const then = (outcome: Outcome, w: Words) => consequence(outcome, w);

  for (const category of facts.categories) {
    const rule = effectiveRule(rules, category);
    const reviewer = rule.reviewer ?? reviewerName;
    const seg = segmentAt(rule.bands, facts.amountCents);
    const range = rangeText(seg.minCents, seg.maxCents);
    if (seg.outcome === null) {
      found.push({
        code: "undefined_range",
        category,
        outcome: GAP_OUTCOME,
        reviewer,
        say: (w) => `No rule covers ${phraseFor(category)} ${range} yet, so ${then(GAP_OUTCOME, w)} to be safe.`,
      });
    } else {
      const outcome = seg.outcome;
      found.push({ code: "band", category, outcome, reviewer, say: (w) => bandSentence(outcome, category, range, w) });
    }
  }

  // Where the reviewer owns the rules, a spending limit goes to whoever this category names.
  // Mom's limits always go to her main reviewer, so a pressured rule change can't move that safeguard.
  const categoryReviewers = new Set(found.map((r) => r.reviewer));
  const capReviewer = ruleOwner === "reviewer" && categoryReviewers.size === 1 ? [...categoryReviewers][0] : reviewerName;

  for (const cap of rules.caps) {
    if (cap.category !== null && !facts.categories.includes(cap.category)) continue;
    const total = spentWithin(history, cap, now) + facts.amountCents;
    if (total <= cap.limitCents) continue;
    const scope = cap.category === null ? "" : `${categoryLabel(cap.category)} `;
    const say = (w: Words) =>
      cap.period === "purchase"
        ? `${formatCents(total)} is over the ${formatCents(cap.limitCents)} ${scope}per-purchase limit, so ${then(cap.over, w)}.`
        : `This would bring ${scope}spending in the last ${cap.period === "week" ? "7" : "30"} days to ${formatCents(total)}, over the ${formatCents(cap.limitCents)} ${scope}${PERIOD_TEXT[cap.period]} limit, so ${then(cap.over, w)}.`;
    found.push({ code: "cap", category: cap.category, outcome: cap.over, reviewer: capReviewer, say });
  }

  const outcome = found.map((r) => r.outcome).reduce(stricter, "auto");
  const final = found.filter((r) => r.outcome === outcome);
  const named = new Set(final.map((r) => r.reviewer));
  const asked = named.size === 1 ? [...named][0] : reviewerName;
  const owner = ruleOwner === "shopper" ? shopperName : reviewerName;
  const words: Words = { shopper: shopperName, reviewer: asked, flow, owner, ownerIsShopper: ruleOwner === "shopper" };
  return {
    outcome,
    reasons: final.map(({ say, ...r }) => ({ ...r, reviewer: asked, message: say(words) })),
    reviewer: asked,
  };
}
