import type { Approver } from "@/lib/policy";

// The same engine serves three relationships. What changes is who shops,
// who reviews, and whose rules they are (which decides how rule changes work;
// see requestRuleChange).

export type RelationshipId = "family_elder" | "parent_child" | "personal_shopper";

export interface Relationship {
  id: RelationshipId;
  title: string;
  summary: string;
  /** Who keeps the final say over money. */
  controlNote: string;
  shopper: { role: string; demoName: string };
  reviewer: { role: string; demoName: string };
  ruleOwner: Approver;
}

export const RELATIONSHIPS: Record<RelationshipId, Relationship> = {
  family_elder: {
    id: "family_elder",
    title: "Elderly parent + adult child",
    summary: "Mom chooses her spending safeguards. Her daughter reviews purchases when Mom's rules ask for it.",
    controlNote: "Mom keeps control of her money.",
    shopper: { role: "Parent", demoName: "Mom" },
    reviewer: { role: "Trusted contact", demoName: "Sarah" },
    ruleOwner: "shopper",
  },
  parent_child: {
    id: "parent_child",
    title: "Kids + parents",
    summary: "A child finds shoes, a game or school supplies and sends a purchase request. The parent reviews the price and approves or declines.",
    controlNote: "The parent controls spending and payment for minors.",
    shopper: { role: "Child", demoName: "Leo" },
    reviewer: { role: "Parent", demoName: "Dana" },
    ruleOwner: "reviewer",
  },
  personal_shopper: {
    id: "personal_shopper",
    title: "Personal shopper + customer",
    summary: "Someone who knows your preferences hunts down products and deals. You review their recommendations and choose what to buy.",
    controlNote: "The customer makes the buying decision.",
    shopper: { role: "Personal shopper", demoName: "Priya" },
    reviewer: { role: "Customer", demoName: "Marcus" },
    ruleOwner: "reviewer",
  },
};

/** The hackathon demo tells the elderly parent story. */
export const DEMO_RELATIONSHIP: RelationshipId =
  (process.env.NEXT_PUBLIC_DEMO_RELATIONSHIP as RelationshipId | undefined) ?? "family_elder";
