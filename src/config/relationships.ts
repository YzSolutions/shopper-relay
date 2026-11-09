import { AI_SHOPPER_RULES, FAMILY_ELDER_RULES, PARENT_CHILD_RULES, PERSONAL_SHOPPER_RULES, SELF_RULES, type Role, type RuleSet } from "@/lib/policy";
import type { Flow } from "@/lib/purchases/lifecycle";

// One engine, four relationships, plus Sarah shopping on her own. What differs is who
// finds products, whose rules they are, who pays, and the words each person sees.

export const RELATIONSHIP_IDS = ["family_elder", "parent_child", "personal_shopper", "ai_shopper", "self"] as const;
export type RelationshipId = (typeof RELATIONSHIP_IDS)[number];

export function isRelationshipId(v: unknown): v is RelationshipId {
  return typeof v === "string" && (RELATIONSHIP_IDS as readonly string[]).includes(v);
}

export interface Relationship {
  id: RelationshipId;
  /** Short name for tabs. */
  tab: string;
  title: string;
  summary: string;
  /** Who keeps the final say over money. */
  controlNote: string;
  shopper: { role: string; demoName: string };
  reviewer: { role: string; demoName: string };
  ruleOwner: Role;
  /** Who pays; their PayPal account is charged. */
  payer: Role;
  /** Who the things bought are for (the "For" column of the PayPal table). */
  buysFor: Role;
  /**
   * hold: the shopper pays; PayPal holds it while the reviewer looks.
   * request: the shopper asks; the reviewer approves and pays.
   */
  flow: Flow;
  /** Whether the reviewer can grant a One-Time Purchase Authorization. */
  otpa: boolean;
  /** Whether the shopper can bill the reviewer for their time (a PayPal invoice). */
  bills: boolean;
  defaultRules: RuleSet;
  /** Words on the shopper's screens. */
  words: {
    shopHeading: string;
    placeholder: string;
    suggestions: string[];
    /** The button on a result: "Choose this", "Ask Sarah". */
    choose: (reviewer: string) => string;
    /** Sent from the purchase page in the request flow. */
    sendRequest: (reviewer: string) => string;
  };
}

export const RELATIONSHIPS: Record<RelationshipId, Relationship> = {
  family_elder: {
    id: "family_elder",
    tab: "Mom + Sarah",
    title: "Elderly parent + adult child",
    summary: "Mom shops on her own. Sarah takes a look only when Mom's own rules say so.",
    controlNote: "Mom keeps control of her money.",
    shopper: { role: "Parent", demoName: "Mom" },
    reviewer: { role: "Trusted contact", demoName: "Sarah" },
    ruleOwner: "shopper",
    payer: "shopper",
    buysFor: "shopper",
    flow: "hold",
    otpa: false,
    bills: false,
    defaultRules: FAMILY_ELDER_RULES,
    words: {
      shopHeading: "What are you shopping for?",
      placeholder: "For example, a blood pressure monitor",
      suggestions: ["Blood pressure monitor", "Winter coat", "Reading glasses", "Walking shoes"],
      choose: () => "Choose this",
      sendRequest: () => "Pay with PayPal",
    },
  },
  parent_child: {
    id: "parent_child",
    tab: "Leo + Sarah",
    title: "Kids + parents",
    summary: "Leo finds things and asks. Sarah approves and pays, or says no, and video games and tech go to Marcus. Weekly and monthly budgets keep it in check.",
    controlNote: "The parent controls spending and payment. Leo never needs a parent's PayPal login.",
    shopper: { role: "Child", demoName: "Leo" },
    reviewer: { role: "Parent", demoName: "Sarah" },
    ruleOwner: "reviewer",
    payer: "reviewer",
    buysFor: "shopper",
    flow: "request",
    otpa: false,
    bills: false,
    defaultRules: PARENT_CHILD_RULES,
    words: {
      shopHeading: "What would you like?",
      placeholder: "For example, a Lego set",
      suggestions: ["Lego set", "Kids book", "Art supplies", "Video game controller"],
      choose: (r) => `Ask ${r}`,
      sendRequest: (r) => `Send to ${r}`,
    },
  },
  personal_shopper: {
    id: "personal_shopper",
    tab: "Priya + Marcus",
    title: "Personal shopper + customer",
    summary: "Priya finds things Marcus will like. Marcus approves and pays, or lets Priya buy one exact item once, at a price Marcus sets.",
    controlNote: "The customer makes every buying decision. A one-time authorization is for one product, once.",
    shopper: { role: "Personal shopper", demoName: "Priya" },
    reviewer: { role: "Customer", demoName: "Marcus" },
    ruleOwner: "reviewer",
    payer: "reviewer",
    buysFor: "reviewer",
    flow: "request",
    otpa: true,
    bills: true,
    defaultRules: PERSONAL_SHOPPER_RULES,
    words: {
      shopHeading: "What are you finding for Marcus?",
      placeholder: "For example, running shoes",
      suggestions: ["Running shoes", "Leather jacket", "Wireless headphones", "Blood pressure monitor"],
      choose: (r) => `Request for ${r}`,
      sendRequest: (r) => `Send to ${r}`,
    },
  },
  ai_shopper: {
    id: "ai_shopper",
    tab: "AI Shopper + Sarah",
    title: "AI shopper + owner",
    summary: "Give the AI a job. Within Sarah's rules it buys with Sarah's saved PayPal, and anything else goes to Sarah first.",
    controlNote: "The owner writes the rules. Code checks them on every listing, and the AI can't buy outside them.",
    shopper: { role: "AI shopper", demoName: "AI Shopper" },
    reviewer: { role: "Owner", demoName: "Sarah" },
    ruleOwner: "reviewer",
    payer: "reviewer",
    buysFor: "reviewer",
    flow: "request",
    otpa: true,
    bills: false,
    defaultRules: AI_SHOPPER_RULES,
    words: {
      shopHeading: "What should the AI shopper find?",
      placeholder: "For example, a modern desk clock under $25",
      suggestions: ["Modern desk clock under $25", "Gaming laptop", "Wireless mouse"],
      choose: (r) => `Ask ${r}`,
      sendRequest: (r) => `Send to ${r}`,
    },
  },
  self: {
    id: "self",
    tab: "Sarah",
    title: "Sarah, on her own",
    summary: "Sarah shops for herself and pays with her own PayPal. Her PayPal table shows everything charged to her account, from every relationship.",
    controlNote: "Sarah's money, Sarah's call.",
    shopper: { role: "Owner", demoName: "Sarah" },
    reviewer: { role: "Owner", demoName: "Sarah" },
    ruleOwner: "shopper",
    payer: "shopper",
    buysFor: "shopper",
    flow: "hold",
    otpa: false,
    bills: false,
    defaultRules: SELF_RULES,
    words: {
      shopHeading: "What are you shopping for?",
      placeholder: "For example, a bed set",
      suggestions: ["Bed set", "Throw blanket", "Desk lamp", "Running shoes"],
      choose: () => "Choose this",
      sendRequest: () => "Pay with PayPal",
    },
  },
};

/** The relationship a fresh visitor sees. */
export const DEMO_RELATIONSHIP: RelationshipId = isRelationshipId(process.env.NEXT_PUBLIC_DEMO_RELATIONSHIP)
  ? process.env.NEXT_PUBLIC_DEMO_RELATIONSHIP
  : "family_elder";

/** The cookie that remembers which relationship the demo is showing. */
export const MODE_COOKIE = "sr_mode";

/** The names and setup the rule engine writes its reasons for. */
export function reasonWords(h: { relationship: RelationshipId; shopperName: string; reviewerName: string }) {
  const r = RELATIONSHIPS[h.relationship];
  return { shopperName: h.shopperName, reviewerName: h.reviewerName, flow: r.flow, ruleOwner: r.ruleOwner };
}
