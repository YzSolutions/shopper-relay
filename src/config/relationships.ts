import { FAMILY_ELDER_RULES, PARENT_CHILD_RULES, PERSONAL_SHOPPER_RULES, type Role, type RuleSet } from "@/lib/policy";
import type { Flow } from "@/lib/purchases/lifecycle";

// One engine, three relationships. What differs is who finds products, whose
// rules they are, who pays, and the words each person sees.

export const RELATIONSHIP_IDS = ["family_elder", "parent_child", "personal_shopper"] as const;
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
    /** The button on a result: "Choose this", "Ask Dana". */
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
    tab: "Kids + parent",
    title: "Kids + parents",
    summary: "Leo finds things and asks. Dana approves and pays, or says no. Weekly and monthly budgets keep it in check.",
    controlNote: "The parent controls spending and payment. Leo never needs a parent's PayPal login.",
    shopper: { role: "Child", demoName: "Leo" },
    reviewer: { role: "Parent", demoName: "Dana" },
    ruleOwner: "reviewer",
    payer: "reviewer",
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
    tab: "Personal shopper",
    title: "Personal shopper + customer",
    summary: "Priya finds things Marcus will like. Marcus approves and pays, or lets Priya buy one exact item once, at a price Marcus sets.",
    controlNote: "The customer makes every buying decision. A one-time authorization is for one product, once.",
    shopper: { role: "Personal shopper", demoName: "Priya" },
    reviewer: { role: "Customer", demoName: "Marcus" },
    ruleOwner: "reviewer",
    payer: "reviewer",
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
