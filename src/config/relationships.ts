import {
  FAMILY_ELDER_RULES,
  PARENT_CHILD_RULES,
  PERSONAL_SHOPPER_RULES,
  type Role,
  type RuleSet,
} from "@/lib/policy";

// One engine, three relationships. What differs is who finds products, whose
// rules they are, and whether the person shopping can ever buy on their own.

export type RelationshipId = "family_elder" | "parent_child" | "personal_shopper";

/**
 * How a purchase can complete without a second person:
 * - self: the shopper pays with their own PayPal, within their own rules.
 * - none: someone else always approves and pays.
 * - delegated: the shopper buys on the customer's behalf within limits the
 *   customer granted. Needs a saved, customer-authorized PayPal payment
 *   method; not built for the hackathon and not yet validated with PayPal.
 */
export type AutoPurchase = "self" | "none" | "delegated";

export interface Relationship {
  id: RelationshipId;
  title: string;
  summary: string;
  /** Who keeps the final say over money. */
  controlNote: string;
  shopper: { role: string; demoName: string };
  reviewer: { role: string; demoName: string };
  ruleOwner: Role;
  /** Who pays; their PayPal account is charged. */
  payer: Role;
  autoPurchase: AutoPurchase;
  defaultRules: RuleSet;
  /** Only the elder preset is a working end-to-end flow in the hackathon build. */
  implemented: boolean;
}

export const RELATIONSHIPS: Record<RelationshipId, Relationship> = {
  family_elder: {
    id: "family_elder",
    title: "Elderly parent + adult child",
    summary: "Mom shops independently. Sarah reviews purchases when Mom's own rules call for it.",
    controlNote: "Mom keeps control of her money.",
    shopper: { role: "Parent", demoName: "Mom" },
    reviewer: { role: "Trusted contact", demoName: "Sarah" },
    ruleOwner: "shopper",
    payer: "shopper",
    autoPurchase: "self",
    defaultRules: FAMILY_ELDER_RULES,
    implemented: true,
  },
  parent_child: {
    id: "parent_child",
    title: "Kids + parents",
    summary: "A child browses, compares and requests. A parent approves or declines every purchase, within weekly and monthly budgets.",
    controlNote: "The parent controls spending and payment. No child PayPal account is assumed.",
    shopper: { role: "Child", demoName: "Leo" },
    reviewer: { role: "Parent", demoName: "Dana" },
    ruleOwner: "reviewer",
    payer: "reviewer",
    autoPurchase: "none",
    defaultRules: PARENT_CHILD_RULES,
    implemented: false,
  },
  personal_shopper: {
    id: "personal_shopper",
    title: "Personal shopper + customer",
    summary: "A trusted shopper finds deals and can buy right away within the customer's limits. Anything over goes to the customer.",
    controlNote: "The customer sets the shopper's authority and can revoke it.",
    shopper: { role: "Personal shopper", demoName: "Priya" },
    reviewer: { role: "Customer", demoName: "Marcus" },
    ruleOwner: "reviewer",
    payer: "reviewer",
    autoPurchase: "delegated",
    defaultRules: PERSONAL_SHOPPER_RULES,
    implemented: false,
  },
};

/** The hackathon demo tells the elderly parent story. */
export const DEMO_RELATIONSHIP: RelationshipId =
  (process.env.NEXT_PUBLIC_DEMO_RELATIONSHIP as RelationshipId | undefined) ?? "family_elder";
