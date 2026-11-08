import type { AmountBand, CategoryId, Outcome, RuleSet } from "./types";

// Default rules for each kind of relationship. These are starting points the
// rule owner can change, not prescribed financial limits. All amounts are the
// full PayPal total in cents, shipping and tax included.

/** Below the threshold one outcome applies, at or above it another. */
function split(thresholdCents: number, below: Outcome, atOrAbove: Outcome): { bands: AmountBand[] } {
  return {
    bands: [
      { minCents: 0, maxCents: thresholdCents, outcome: below },
      { minCents: thresholdCents, maxCents: null, outcome: atOrAbove },
    ],
  };
}

function always(outcome: Outcome): { bands: AmountBand[] } {
  return { bands: [{ minCents: 0, maxCents: null, outcome }] };
}

type Limits = Partial<Record<CategoryId, number>>;

/** "Under $X": exactly $X is already over. */
function under(limits: Limits, within: Outcome, over: Outcome): RuleSet["categories"] {
  return Object.fromEntries(Object.entries(limits).map(([c, cents]) => [c, split(cents, within, over)]));
}

/** "Up to $X": exactly $X is still within. */
function upTo(limits: Limits, within: Outcome, over: Outcome): RuleSet["categories"] {
  return Object.fromEntries(Object.entries(limits).map(([c, cents]) => [c, split(cents + 1, within, over)]));
}

/**
 * Mom + Sarah (the hackathon demo). Mom buys on her own under each limit;
 * at or over it, Sarah reviews. Subscriptions are always reviewed.
 * Medical Visits stay in the rules even though product search can't find them.
 */
export const FAMILY_ELDER_RULES: RuleSet = {
  categories: {
    ...under(
      {
        general: 150_00,
        food: 200_00,
        clothing: 200_00,
        medical_device: 100_00,
        medical_visit: 150_00,
      },
      "auto",
      "review",
    ),
    subscription: always("review"),
  },
  caps: [],
};

/**
 * Child + parent. Every purchase needs the parent; the per-item amounts are
 * budgets, and going over one, or over the weekly or monthly total, needs an
 * explicit parent exception. Subscriptions are blocked unless the parent
 * enables them. Video games and tech go to the other parent.
 */
export const PARENT_CHILD_RULES: RuleSet = {
  categories: {
    ...upTo(
      {
        general: 10_00,
        food: 8_00,
        toys: 15_00,
        clothing: 25_00,
        shoes_handbags: 25_00,
        books: 15_00,
        school_supplies: 20_00,
      },
      "review",
      "exception",
    ),
    video_games: { ...split(20_01, "review", "exception"), reviewer: "Marcus" },
    electronics: { ...split(30_01, "review", "exception"), reviewer: "Marcus" },
    subscription: always("blocked"),
  },
  caps: [
    { category: null, period: "week", limitCents: 30_00, over: "exception" },
    { category: null, period: "month", limitCents: 100_00, over: "exception" },
  ],
};

/**
 * AI shopper + owner. Nothing is bought without the owner until the owner writes
 * a rule that allows it. Subscriptions are blocked.
 */
export const AI_SHOPPER_RULES: RuleSet = {
  categories: { general: always("review"), subscription: always("blocked") },
  caps: [{ category: null, period: "week", limitCents: 500_00, over: "exception" }],
};

/**
 * Personal shopper + customer. The shopper never buys on their own: every
 * find goes to the customer, who declines, approves and pays, or grants a
 * One-Time Purchase Authorization. The amounts are the customer's target
 * budgets; a find over one is flagged as over budget. Subscriptions need the
 * customer's explicit consent like everything else.
 */
export const PERSONAL_SHOPPER_RULES: RuleSet = {
  categories: {
    ...upTo(
      {
        general: 100_00,
        clothing: 200_00,
        shoes_handbags: 150_00,
        gifts: 125_00,
        home_decor: 250_00,
        electronics: 400_00,
        collectibles: 300_00,
      },
      "review",
      "exception",
    ),
    subscription: always("review"),
  },
  caps: [],
};
