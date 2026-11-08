import type { CategoryResolution, Decision, RecurringFinding } from "../policy";
import type { Flow, Otpa, PurchaseState, PurchaseSummary } from "../purchases/lifecycle";
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
  /** Kept so a one-time authorization can recognize the same model at another store. */
  modelNumber?: string | null;
  /** The listing's key features, for the reviewer's short message. */
  specs?: string[];
  /** Demo mode: blur the photo. */
  imageHidden?: boolean;
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
  flow: Flow;
  /** Who is asked about this purchase. */
  reviewerName: string | null;
  otpa: Otpa | null;
  paypalOrderId: string | null;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  /** What PayPal is (or was) holding. */
  paypalAmountCents: number | null;
  /** What PayPal actually took when the purchase completed. */
  paypalCapturedCents: number | null;
  /** Paid with the payer's standing permission (saved PayPal), not approved one by one. */
  standing: boolean;
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
  flow: Flow;
  reviewer_name: string | null;
  otpa: Otpa | null;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_amount_cents: number | null;
  paypal_captured_cents: number | null;
  standing: boolean;
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
  flow: r.flow,
  reviewerName: r.reviewer_name,
  otpa: r.otpa,
  paypalOrderId: r.paypal_order_id,
  paypalAuthorizationId: r.paypal_authorization_id,
  paypalCaptureId: r.paypal_capture_id,
  paypalAmountCents: r.paypal_amount_cents,
  paypalCapturedCents: r.paypal_captured_cents,
  standing: r.standing,
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
  flow: Flow;
  reviewerName: string;
}): Promise<Purchase> {
  const [row] = (await db()`
    insert into purchases (household_id, status, product, reviewed_cents, currency, category, recurring, terms, decision, flow, reviewer_name)
    values (${p.householdId}, ${p.state}, ${JSON.stringify(p.item)}::jsonb, ${p.reviewedCents}, ${p.currency},
            ${JSON.stringify(p.category)}::jsonb, ${p.recurring}, ${p.terms ? JSON.stringify(p.terms) : null}::jsonb,
            ${JSON.stringify(p.decision)}::jsonb, ${p.flow}, ${p.reviewerName})
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
    // An active authorization reserves the most it allows; anything else, the held or listed amount.
    amountCents: p.state === "hunting" && p.otpa ? p.otpa.maxCents : (p.paypalAmountCents ?? p.reviewedCents),
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
    paypalCapturedCents: number;
    reviewToken: string | null;
    reviewExpiresAt: string | null;
    otpa: Otpa;
    item: PurchaseItem;
    reviewedCents: number;
    reviewerName: string;
    standing: boolean;
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
      paypal_captured_cents = coalesce(${fields.paypalCapturedCents ?? null}, paypal_captured_cents),
      otpa = coalesce(${fields.otpa ? JSON.stringify(fields.otpa) : null}::jsonb, otpa),
      product = coalesce(${fields.item ? JSON.stringify(fields.item) : null}::jsonb, product),
      reviewed_cents = coalesce(${fields.reviewedCents ?? null}, reviewed_cents),
      reviewer_name = coalesce(${fields.reviewerName ?? null}, reviewer_name),
      standing = coalesce(${fields.standing ?? null}, standing),
      review_token = case when ${"reviewToken" in fields} then ${fields.reviewToken ?? null} else review_token end,
      review_expires_at = case when ${"reviewExpiresAt" in fields} then ${fields.reviewExpiresAt ?? null}::timestamptz else review_expires_at end,
      updated_at = now()
    where id = ${id} and status = ${from}
    returning *`) as Row[];
  return rows[0] ? toPurchase(rows[0]) : null;
}

/** Set the PayPal order on a purchase (a retry creates a new order). Draft authorization terms ride along for the request flow. */
export async function setPayPalOrder(id: string, orderId: string, otpa?: Otpa | null): Promise<void> {
  await db()`
    update purchases set paypal_order_id = ${orderId}, otpa = ${otpa ? JSON.stringify(otpa) : null}::jsonb, updated_at = now()
    where id = ${id}`;
}

/** Demo control: pretend time has passed for every waiting review in a household. */
export async function shiftReviewDeadlines(householdId: string, hours: number): Promise<void> {
  await db()`
    update purchases set review_expires_at = review_expires_at - make_interval(hours => ${hours})
    where household_id = ${householdId} and status in ('awaiting_review', 'requested', 'hunting') and review_expires_at is not null`;
  await db()`
    update purchases set otpa = jsonb_set(otpa, '{expiresAt}', to_jsonb(to_char((otpa->>'expiresAt')::timestamptz - make_interval(hours => ${hours}), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    where household_id = ${householdId} and status = 'hunting' and otpa is not null`;
}
