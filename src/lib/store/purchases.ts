import type { CategoryResolution, Decision, RecurringFinding } from "../policy";
import type { PurchaseState, PurchaseSummary } from "../purchases/lifecycle";
import type { AiTerms } from "../ai/terms";
import { db } from "../db/client";

/** What the shopper chose, frozen at the moment they chose it. */
export interface PurchaseItem {
  kind: "catalog" | "checked";
  title: string;
  brand: string | null;
  merchant: string | null;
  url: string | null;
  imageUrl: string | null;
  source: string | null;
  sourceId: string | null;
  categoryPath: string[];
}

export interface Purchase {
  id: string;
  householdId: string;
  state: PurchaseState;
  item: PurchaseItem;
  reviewedCents: number;
  currency: string;
  category: CategoryResolution;
  recurring: RecurringFinding;
  terms: AiTerms | null;
  decision: Decision;
  paypalOrderId: string | null;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  paypalAmountCents: number | null;
  reviewToken: string | null;
  reviewExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  household_id: string;
  status: PurchaseState;
  product: PurchaseItem;
  reviewed_cents: number;
  currency: string;
  category: CategoryResolution;
  recurring: RecurringFinding;
  terms: AiTerms | null;
  decision: Decision;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_amount_cents: number | null;
  review_token: string | null;
  review_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const iso = (v: string | null) => (v === null ? null : new Date(v).toISOString());

const toPurchase = (r: Row): Purchase => ({
  id: r.id,
  householdId: r.household_id,
  state: r.status,
  item: r.product,
  reviewedCents: r.reviewed_cents,
  currency: r.currency,
  category: r.category,
  recurring: r.recurring,
  terms: r.terms,
  decision: r.decision,
  paypalOrderId: r.paypal_order_id,
  paypalAuthorizationId: r.paypal_authorization_id,
  paypalCaptureId: r.paypal_capture_id,
  paypalAmountCents: r.paypal_amount_cents,
  reviewToken: r.review_token,
  reviewExpiresAt: iso(r.review_expires_at),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
});

export async function insertPurchase(p: {
  householdId: string;
  state: PurchaseState;
  item: PurchaseItem;
  reviewedCents: number;
  currency: string;
  category: CategoryResolution;
  recurring: RecurringFinding;
  terms: AiTerms | null;
  decision: Decision;
}): Promise<Purchase> {
  const [row] = (await db()`
    insert into purchases (household_id, status, product, reviewed_cents, currency, category, recurring, terms, decision)
    values (${p.householdId}, ${p.state}, ${JSON.stringify(p.item)}::jsonb, ${p.reviewedCents}, ${p.currency},
            ${JSON.stringify(p.category)}::jsonb, ${p.recurring}, ${p.terms ? JSON.stringify(p.terms) : null}::jsonb,
            ${JSON.stringify(p.decision)}::jsonb)
    returning *`) as Row[];
  return toPurchase(row);
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  const rows = (await db()`select * from purchases where id = ${id}`) as Row[];
  return rows[0] ? toPurchase(rows[0]) : null;
}

export async function getPurchaseByReviewToken(token: string): Promise<Purchase | null> {
  const rows = (await db()`select * from purchases where review_token = ${token}`) as Row[];
  return rows[0] ? toPurchase(rows[0]) : null;
}

export async function getPurchaseByPayPalId(id: string): Promise<Purchase | null> {
  const rows = (await db()`
    select * from purchases where paypal_order_id = ${id} or paypal_authorization_id = ${id} or paypal_capture_id = ${id}`) as Row[];
  return rows[0] ? toPurchase(rows[0]) : null;
}

export async function listPurchases(householdId: string, limit = 50): Promise<Purchase[]> {
  const rows = (await db()`select * from purchases where household_id = ${householdId} order by created_at desc limit ${limit}`) as Row[];
  return rows.map(toPurchase);
}

export function summarize(p: Purchase): PurchaseSummary {
  return {
    id: p.id,
    state: p.state,
    createdAt: p.createdAt,
    categories: p.category.categories,
    amountCents: p.paypalAmountCents ?? p.reviewedCents,
  };
}

/**
 * Move a purchase to a new state, but only if it is still in the state the
 * caller expects. Returns null if someone else got there first (a double
 * click, or the reviewer and a timeout at the same moment).
 */
export async function transitionPurchase(
  id: string,
  from: PurchaseState,
  to: PurchaseState,
  fields: Partial<{
    decision: Decision;
    paypalOrderId: string;
    paypalAuthorizationId: string;
    paypalCaptureId: string;
    paypalAmountCents: number;
    reviewToken: string | null;
    reviewExpiresAt: string | null;
  }> = {},
): Promise<Purchase | null> {
  const rows = (await db()`
    update purchases set
      status = ${to},
      decision = coalesce(${fields.decision ? JSON.stringify(fields.decision) : null}::jsonb, decision),
      paypal_order_id = coalesce(${fields.paypalOrderId ?? null}, paypal_order_id),
      paypal_authorization_id = coalesce(${fields.paypalAuthorizationId ?? null}, paypal_authorization_id),
      paypal_capture_id = coalesce(${fields.paypalCaptureId ?? null}, paypal_capture_id),
      paypal_amount_cents = coalesce(${fields.paypalAmountCents ?? null}, paypal_amount_cents),
      review_token = case when ${"reviewToken" in fields} then ${fields.reviewToken ?? null} else review_token end,
      review_expires_at = case when ${"reviewExpiresAt" in fields} then ${fields.reviewExpiresAt ?? null}::timestamptz else review_expires_at end,
      updated_at = now()
    where id = ${id} and status = ${from}
    returning *`) as Row[];
  return rows[0] ? toPurchase(rows[0]) : null;
}

/** Set the PayPal order on a purchase that is already in checkout (a retry creates a new order). */
export async function setPayPalOrder(id: string, orderId: string): Promise<void> {
  await db()`update purchases set paypal_order_id = ${orderId}, updated_at = now() where id = ${id}`;
}

/** Demo control: pretend time has passed for every waiting review in a household. */
export async function shiftReviewDeadlines(householdId: string, hours: number): Promise<void> {
  await db()`
    update purchases set review_expires_at = review_expires_at - make_interval(hours => ${hours})
    where household_id = ${householdId} and status = 'awaiting_review'`;
}
