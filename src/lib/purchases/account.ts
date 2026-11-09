import { RELATIONSHIPS, type RelationshipId } from "@/config/relationships";

// One person's PayPal account, across every relationship they're in: the History table.
// A purchase belongs to the account it charges (or asks to charge), not to the relationship
// it was made in. So Sarah's table has Leo's requests she pays for, her AI shopper's buys and
// her own shopping, but not Leo's tech that Marcus reviews and pays, and not Mom's own money.

export interface AccountHousehold {
  relationship: RelationshipId;
  shopperName: string;
  reviewerName: string;
}

export interface AccountPurchase {
  /** Who this one is sent to; Marcus for Leo's tech, otherwise the household's reviewer. */
  reviewerName: string | null;
  /** Paid with the household payer's saved PayPal. */
  standing: boolean;
}

/** The person whose PayPal a household's purchases are paid from, by default. */
export function accountHolder(h: AccountHousehold): string {
  return RELATIONSHIPS[h.relationship].payer === "shopper" ? h.shopperName : h.reviewerName;
}

/** Whose PayPal this purchase charges: the shopper's own, the saved PayPal it used, or whoever approves and pays. */
export function payerOf(h: AccountHousehold, p: AccountPurchase): string {
  if (RELATIONSHIPS[h.relationship].payer === "shopper" || p.standing) return accountHolder(h);
  return p.reviewerName ?? h.reviewerName;
}

/** Who the things bought in this household are for. */
export function boughtFor(h: AccountHousehold): string {
  return RELATIONSHIPS[h.relationship].buysFor === "shopper" ? h.shopperName : h.reviewerName;
}

/** The purchases that charge `holder`'s PayPal. */
export function statement<T extends { household: AccountHousehold; purchase: AccountPurchase }>(entries: T[], holder: string): T[] {
  return entries.filter((e) => payerOf(e.household, e.purchase) === holder);
}
