// The guided tour on /demo: a few steps for each relationship, ticked off from
// what has really happened in this visitor's demo, not from what was clicked.

import type { Purchase } from "@/lib/store/purchases";
import type { RelationshipId } from "./relationships";

/** What has happened so far in this household, as far as the tour cares. */
export interface TourFacts {
  /** A purchase went straight through under the shopper's own rules (hold flow). */
  boughtAlone: boolean;
  /** Something was chosen from a checked checkout screenshot. */
  checkedChosen: boolean;
  /** The reviewer approved or declined a held payment. */
  heldDecided: boolean;
  /** The shopper sent the reviewer a request. */
  requested: boolean;
  /** The reviewer approved and paid for a request, or said no. */
  requestDecided: boolean;
  otpaGranted: boolean;
  otpaUsed: boolean;
  billSent: boolean;
  rulesChanged: boolean;
  standingOn: boolean;
  /** The AI Shopper bought within the rules, or asked because it couldn't. */
  goalBought: boolean;
  goalAsked: boolean;
  /** The owner put a date on the Occasions calendar, and the AI shopped ahead of one. */
  occasionAdded: boolean;
  occasionShopped: boolean;
  /** History has been opened. Only the browser knows (opening a page logs nothing), so the tour sets it. */
  historySeen: boolean;
}

/** Where History notes it was opened, per household, for the tour to read. */
export const historySeenKey = (householdId: string) => `sr_history_seen:${householdId}`;

export const NO_FACTS: TourFacts = {
  boughtAlone: false,
  checkedChosen: false,
  heldDecided: false,
  requested: false,
  requestDecided: false,
  otpaGranted: false,
  otpaUsed: false,
  billSent: false,
  rulesChanged: false,
  standingOn: false,
  goalBought: false,
  goalAsked: false,
  occasionAdded: false,
  occasionShopped: false,
  historySeen: false,
};

export function tourFacts(purchases: Array<Pick<Purchase, "flow" | "state" | "terms" | "decision">>, eventTypes: string[]): TourFacts {
  const types = new Set(eventTypes);
  const held = purchases.filter((p) => p.flow === "hold");
  const requests = purchases.filter((p) => p.flow === "request");
  return {
    boughtAlone: held.some((p) => p.state === "completed" && p.decision.outcome === "auto"),
    checkedChosen: purchases.some((p) => p.terms !== null),
    heldDecided: held.some((p) => (p.state === "completed" || p.state === "declined") && p.decision.outcome !== "auto"),
    requested: types.has("requested"),
    requestDecided: requests.some((p) => p.state === "completed" || p.state === "declined"),
    otpaGranted: types.has("otpa_granted"),
    otpaUsed: types.has("otpa_used"),
    billSent: types.has("bill_sent"),
    rulesChanged: types.has("rules_changed"),
    standingOn: types.has("standing_on"),
    goalBought: types.has("agent_goal_bought"),
    goalAsked: types.has("agent_goal_asked"),
    occasionAdded: types.has("occasion_added"),
    occasionShopped: types.has("occasion_shopped"),
    historySeen: false,
  };
}

export interface TourStep {
  title: string;
  /** What to do, naming the screens and buttons as they appear. */
  how: string;
  /** Where the shopper's screen should go for this step; none when it happens on the phone. */
  go?: { path: string; label: string };
  /** Offer to open the purchase waiting under a one-time authorization, once there is one. */
  goHunting?: boolean;
  /** This step asks someone to approve in PayPal's window. */
  pays?: boolean;
  fact: keyof TourFacts;
}

export const TOURS: Record<RelationshipId, TourStep[]> = {
  family_elder: [
    {
      title: "Buy within the rules",
      how: "Search for a blood pressure monitor, pick one under $100, and pay. It goes straight through.",
      go: { path: "/shop", label: "Go to Shop" },
      pays: true,
      fact: "boughtAlone",
    },
    {
      title: "Catch a hidden charge",
      how: "Use the example with a membership in the small print, then tap Buy it through ShopperRelay.",
      go: { path: "/check", label: "Go to Check a checkout" },
      fact: "checkedChosen",
    },
    {
      title: "Sarah decides",
      how: "Pay with PayPal: the money is only held. Then approve or decline on Sarah's phone.",
      pays: true,
      fact: "heldDecided",
    },
    {
      title: "Write a rule",
      how: "Tick “Replace all the rules with this” and write: Under $75 I decide. Over $150 Sarah decides.",
      go: { path: "/rules", label: "Go to My rules" },
      fact: "rulesChanged",
    },
  ],
  parent_child: [
    {
      title: "Leo asks",
      how: "Search for a Lego set, tap Ask Sarah, and send it.",
      go: { path: "/shop", label: "Go to Shop" },
      fact: "requested",
    },
    {
      title: "Sarah decides",
      how: "On Sarah's phone, approve and pay with PayPal, or decline.",
      pays: true,
      fact: "requestDecided",
    },
    {
      title: "Change a rule",
      how: "Write: Leo can ask for books up to $25. Then save it as Sarah.",
      go: { path: "/rules", label: "Go to Rules" },
      fact: "rulesChanged",
    },
  ],
  personal_shopper: [
    {
      title: "Priya finds it",
      how: "Search for running shoes, tap Request for Marcus, and send it.",
      go: { path: "/shop", label: "Go to Shop" },
      fact: "requested",
    },
    {
      title: "Marcus sets a price",
      how: "On Marcus's phone, tap “Let Priya buy it once, up to a price I set”, then approve in PayPal.",
      pays: true,
      fact: "otpaGranted",
    },
    {
      title: "Send the AI shopper",
      how: "Tap Send the AI shopper. It can only buy what Marcus allowed, and PayPal releases the rest.",
      goHunting: true,
      fact: "otpaUsed",
    },
    {
      title: "Priya bills Marcus",
      how: "Send Marcus a bill for Priya's time.",
      go: { path: "/bills", label: "Go to Bills" },
      fact: "billSent",
    },
  ],
  ai_shopper: [
    {
      title: "Sarah writes a rule",
      how: "Write: The AI shopper can buy desk clocks under $25 without asking. Then save it as Sarah.",
      go: { path: "/rules", label: "Go to Rules" },
      fact: "rulesChanged",
    },
    {
      title: "Sarah saves PayPal",
      how: "On Sarah's phone, tap Let AI Shopper buy without asking, then log in with a PayPal sandbox account.",
      fact: "standingOn",
    },
    {
      title: "Put Secret Santa on the calendar",
      how: "On Occasions, tap Try the Secret Santa example, then Add occasion. The AI will shop for it a week before.",
      go: { path: "/occasions", label: "Go to Occasions" },
      fact: "occasionAdded",
    },
    {
      title: "The AI shops ahead",
      how: "Tap Shop now on Office Secret Santa. Normally the AI does this on its own a week before. A desk clock under $25 is within Sarah's rule, so it buys it.",
      go: { path: "/occasions", label: "Go to Occasions" },
      fact: "occasionShopped",
    },
    {
      title: "Outside the rule",
      how: "Ask for a gaming laptop. The rule doesn't cover it, so the AI asks Sarah instead.",
      go: { path: "/shop", label: "Go to AI Shopper" },
      fact: "goalAsked",
    },
  ],
  self: [
    {
      title: "Sarah shops for herself",
      how: "Search for a bed set, pick one, and pay with PayPal. It's her own money, so it goes straight through.",
      go: { path: "/shop", label: "Go to Shop" },
      pays: true,
      fact: "boughtAlone",
    },
    {
      title: "Catch a hidden charge",
      how: "Use the example with a membership in the small print, then tap Buy it through ShopperRelay.",
      go: { path: "/check", label: "Go to Check a checkout" },
      fact: "checkedChosen",
    },
    {
      title: "Everything on Sarah's PayPal",
      how: "Open History. One table shows everything charged to Sarah's PayPal: her own shopping, what she paid for Leo, and what her AI shopper bought. Leo's tech that Marcus pays for, and Mom's own shopping, aren't there.",
      go: { path: "/history", label: "Go to History" },
      fact: "historySeen",
    },
  ],
};
