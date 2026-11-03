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
}

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
      how: "Search for a blood pressure monitor, choose one under $100, and pay. Mom's rules allow it, so it goes straight through.",
      go: { path: "/shop", label: "Go to Shop" },
      pays: true,
      fact: "boughtAlone",
    },
    {
      title: "Catch a hidden charge",
      how: "Use the example with a membership in the small print. The AI finds the $39 a month, and Mom's rules send it to Sarah. Then tap Buy it through ShopperRelay.",
      go: { path: "/check", label: "Go to Check a checkout" },
      fact: "checkedChosen",
    },
    {
      title: "Sarah decides",
      how: "Pay with PayPal: the money is only held. Then, on Sarah's phone, tap Approve or Decline, and watch PayPal capture or release it.",
      pays: true,
      fact: "heldDecided",
    },
    {
      title: "Write a rule",
      how: "Tick “Replace all the rules with this” and write: Under $75 I decide. Over $150 Sarah decides. It asks about the gap. Add: In between, Sarah takes a look. Then save.",
      go: { path: "/rules", label: "Go to My rules" },
      fact: "rulesChanged",
    },
  ],
  parent_child: [
    {
      title: "Leo asks",
      how: "Search for a Lego set, tap Ask Dana on one, and send it. Nothing is paid yet.",
      go: { path: "/shop", label: "Go to Shop" },
      fact: "requested",
    },
    {
      title: "Dana decides",
      how: "On Dana's phone, see the request next to Leo's budget. Approve and pay with PayPal, or decline.",
      pays: true,
      fact: "requestDecided",
    },
    {
      title: "Change a rule",
      how: "Write: Leo can ask for books up to $25. Check it, then save it as Dana.",
      go: { path: "/rules", label: "Go to Rules" },
      fact: "rulesChanged",
    },
  ],
  personal_shopper: [
    {
      title: "Priya finds it",
      how: "Search for running shoes, tap Request for Marcus on a pair, and send it.",
      go: { path: "/shop", label: "Go to Shop" },
      fact: "requested",
    },
    {
      title: "Marcus sets a price",
      how: "On Marcus's phone, tap “Let Priya buy it once, up to a price I set”, and approve the hold in PayPal. That money can only buy this one product.",
      pays: true,
      fact: "otpaGranted",
    },
    {
      title: "Send the AI shopper",
      how: "On Priya's screen, tap Send the AI shopper. It picks a listing and buys it, and it can only buy what Marcus allowed. PayPal takes the real price and releases the rest.",
      goHunting: true,
      fact: "otpaUsed",
    },
    {
      title: "Priya bills Marcus",
      how: "Send Marcus a bill for Priya's time. PayPal creates a real sandbox invoice.",
      go: { path: "/bills", label: "Go to Bills" },
      fact: "billSent",
    },
  ],
};
