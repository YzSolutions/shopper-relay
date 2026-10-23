// The purchase flow, end to end: choose -> PayPal hold -> capture, or wait for
// the reviewer -> capture or void. Each step re-reads the purchase and moves
// it with a guarded state change, so double clicks and races can't charge twice.

import { randomBytes, randomUUID } from "node:crypto";
import { brand } from "@/config/brand";
import { classifyProduct } from "../ai/products";
import { recurringFinding } from "../ai/terms";
import { anonymizeProduct } from "../catalog/anonymize";
import { createChannel3Source } from "../catalog/channel3";
import { bestOffer } from "../catalog/compare";
import type { Product } from "../catalog/types";
import { formatCents, numberToCents } from "../money";
import { activeRules, CATEGORY_LABELS, evaluatePurchase, resolveCategory, type RecurringFinding } from "../policy";
import { configFromEnv, createPayPalClient, firstAuthorization, PayPalError, type PayPalClient } from "../paypal/client";
import { getCheck } from "../store/checks";
import { logEvent } from "../store/events";
import { getRulesState, type Household } from "../store/households";
import {
  getPurchase,
  insertPurchase,
  listPurchases,
  setPayPalOrder,
  summarize,
  transitionPurchase,
  type Purchase,
  type PurchaseItem,
} from "../store/purchases";
import { decideAfterHold, historyFrom, isFinal, reviewExpiresAt } from "./lifecycle";

export class FlowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

let paypalClient: PayPalClient | null = null;
const paypal = () => (paypalClient ??= createPayPalClient(configFromEnv()));

async function historyFor(household: Household, excludeId?: string) {
  return historyFrom((await listPurchases(household.id, 200)).map(summarize), excludeId);
}

async function evaluateFor(household: Household, amountCents: number, categories: Purchase["category"]["categories"], excludeId?: string) {
  const rules = activeRules(await getRulesState(household.id));
  return evaluatePurchase(rules, { amountCents, categories }, await historyFor(household, excludeId), {
    shopperName: household.shopperName,
    reviewerName: household.reviewerName,
  });
}

async function categorize(categoryPath: string[], fallback: () => Promise<{ category: Purchase["category"]["primary"]; confidence: number }>, recurring: RecurringFinding) {
  let resolution = resolveCategory({ catalogPath: categoryPath, recurring });
  if (resolution.basis === "ambiguous" && !categoryPath.length) {
    // No catalog category at all: ask the AI, and let resolveCategory decide how far to trust it.
    const ai = await fallback().catch(() => null);
    resolution = resolveCategory({ catalogPath: categoryPath, ai, recurring });
  }
  return resolution;
}

/** Choose an item found through in-app search. Price and stock are re-read from the catalog, never taken from the browser. */
export async function chooseCatalogItem(household: Household, sourceId: string, merchant?: string): Promise<Purchase> {
  const real = await createChannel3Source().get(sourceId);
  if (!real) throw new FlowError("That product is no longer available.", 404);
  // In demo mode the browser only knows invented store names, so match either.
  const product = household.hideBrands ? anonymizeProduct(real) : real;
  const offer =
    (merchant ? product.offers.find((o, i) => o.available && (o.merchant === merchant || real.offers[i].merchant === merchant)) : null) ??
    bestOffer(product);
  if (!offer) throw new FlowError("That product is out of stock everywhere right now.", 409);

  // Catalog listings carry no purchase terms, so nothing recurring is known. Shown as "No recurring charge listed".
  const recurring: RecurringFinding = "no";
  const category = await categorize(product.categoryPath, () => classifyProduct(product), recurring);
  const decision = await evaluateFor(household, offer.priceCents, category.categories);
  return recordChoice(household, {
    item: itemFromProduct(product, offer.merchant, offer.url),
    reviewedCents: offer.priceCents,
    currency: offer.currency,
    category,
    recurring,
    terms: null,
    decision,
  });
}

/** Choose an item the shopper checked from a screenshot ("Check Before You Buy"). */
export async function chooseCheckedItem(household: Household, checkId: string): Promise<Purchase> {
  const terms = await getCheck(household.id, checkId);
  if (!terms) throw new FlowError("That check wasn't found.", 404);
  if (!terms.readable || terms.totalDueTodayDollars === null) {
    throw new FlowError("The total due today couldn't be read from that screenshot, so it can't be bought from here.", 422);
  }
  const recurring = recurringFinding(terms);
  const title = terms.productName ?? "Item from a screenshot";
  const pseudoProduct: Product = {
    source: "channel3",
    sourceId: "",
    title,
    brand: null,
    modelNumber: null,
    description: terms.plainSummary,
    imageUrl: null,
    categoryPath: [],
    keyFeatures: [],
    attributes: {},
    offers: [],
  };
  const category = await categorize([], () => classifyProduct(pseudoProduct), recurring);
  const reviewedCents = numberToCents(terms.totalDueTodayDollars);
  const decision = await evaluateFor(household, reviewedCents, category.categories);
  return recordChoice(household, {
    item: { kind: "checked", title, brand: null, merchant: terms.seller, url: null, imageUrl: null, source: null, sourceId: null, categoryPath: [] },
    reviewedCents,
    currency: "USD",
    category,
    recurring,
    terms,
    decision,
  });
}

function itemFromProduct(p: Product, merchant: string, url: string): PurchaseItem {
  return {
    kind: "catalog",
    title: p.title,
    brand: p.brand,
    merchant,
    url,
    imageUrl: p.imageUrl,
    source: p.source,
    sourceId: p.sourceId,
    categoryPath: p.categoryPath,
    ...(p.imageHidden && { imageHidden: true }),
  };
}

async function recordChoice(
  household: Household,
  c: Pick<Purchase, "item" | "reviewedCents" | "currency" | "category" | "recurring" | "terms" | "decision">,
): Promise<Purchase> {
  const state = c.decision.outcome === "blocked" ? "blocked" : "evaluated";
  const purchase = await insertPurchase({ householdId: household.id, state, ...c });
  const label = CATEGORY_LABELS[c.category.primary];
  await logEvent({
    householdId: household.id,
    purchaseId: purchase.id,
    type: "chosen",
    actor: "shopper",
    message: `${household.shopperName} chose ${c.item.title} for ${formatCents(c.reviewedCents)}. Counted as ${label}.`,
    detail: { category: c.category, recurring: c.recurring },
  });
  await logEvent({
    householdId: household.id,
    purchaseId: purchase.id,
    type: state === "blocked" ? "blocked" : "evaluated",
    actor: "system",
    message: c.decision.reasons.map((r) => r.message).join(" "),
    detail: c.decision,
  });
  return purchase;
}

async function load(household: Household, id: string): Promise<Purchase> {
  const p = await getPurchase(id);
  if (!p || p.householdId !== household.id) throw new FlowError("Purchase not found.", 404);
  return p;
}

/** Create the PayPal order. The buyer approves it in PayPal's own window; no money moves yet. */
export async function startCheckout(household: Household, id: string): Promise<{ orderId: string }> {
  let p = await load(household, id);
  if (p.state === "evaluated") {
    p = (await transitionPurchase(p.id, "evaluated", "checkout")) ?? (await load(household, id));
  }
  if (p.state !== "checkout") throw new FlowError(`This purchase is ${p.state.replace("_", " ")} and can't be paid for.`, 409);

  const order = await paypal().createAuthorizeOrder({
    amountCents: p.reviewedCents,
    currency: p.currency,
    description: `${p.item.title}${p.item.merchant ? ` (${p.item.merchant})` : ""}`,
    customId: p.id,
    brandName: brand.name,
    requestId: `order-${p.id}-${randomUUID()}`,
  });
  await setPayPalOrder(p.id, order.id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "checkout_started",
    actor: "shopper",
    message: `${household.shopperName} started PayPal checkout for ${formatCents(p.reviewedCents)}.`,
    detail: { orderId: order.id },
  });
  return { orderId: order.id };
}

/**
 * The buyer approved the order in PayPal. Place the hold, check PayPal's
 * amount, run the rules again, then capture, wait for the reviewer, or void.
 */
export async function completeApproval(household: Household, id: string, orderId: string): Promise<Purchase> {
  const p = await load(household, id);
  if (p.state !== "checkout") {
    if (isFinal(p.state) || p.state === "awaiting_review") return p; // already handled (double submit)
    throw new FlowError(`This purchase is ${p.state} and isn't waiting for PayPal.`, 409);
  }
  if (p.paypalOrderId !== orderId) throw new FlowError("That PayPal order doesn't belong to this purchase.", 400);

  const authorized = await paypal().authorizeOrder(orderId, `authorize-${p.id}-${orderId}`);
  const auth = firstAuthorization(authorized);
  if (!auth || (auth.status !== "CREATED" && auth.status !== "PENDING")) {
    const failed = await transitionPurchase(p.id, "checkout", "failed");
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "failed", actor: "paypal", message: "PayPal didn't place the hold, so nothing was charged.", detail: { order: authorized } });
    return failed ?? load(household, id);
  }
  // Read the hold back from PayPal; this amount is the one that counts.
  const held = await paypal().getAuthorization(auth.id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "held",
    actor: "paypal",
    message: `PayPal placed a hold of ${held.amount.value} ${held.amount.currency_code}. Nothing has been charged yet.`,
    detail: { authorizationId: held.id, status: held.status, expires: held.expiration_time },
  });

  const now = new Date();
  const outcome = decideAfterHold({
    reviewedCents: p.reviewedCents,
    paypalAmount: held.amount,
    currency: p.currency,
    rules: activeRules(await getRulesState(household.id), now),
    categories: p.category.categories,
    history: await historyFor(household, p.id),
    now,
    shopperName: household.shopperName,
    reviewerName: household.reviewerName,
  });
  const paypalAmountCents = outcome.amount.paypalCents ?? undefined;

  if (outcome.action === "void") {
    await paypal().voidAuthorization(held.id, `void-${p.id}`);
    const next = await transitionPurchase(p.id, "checkout", outcome.next, {
      paypalAuthorizationId: held.id,
      paypalAmountCents,
      ...(outcome.decision && { decision: outcome.decision }),
    });
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "voided", actor: "system", message: `${outcome.message} The hold was released; nothing was charged.` });
    return next ?? load(household, id);
  }

  if (outcome.action === "capture") {
    const moved = await transitionPurchase(p.id, "checkout", "completed", { decision: outcome.decision, paypalAuthorizationId: held.id, paypalAmountCents });
    if (!moved) return load(household, id);
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "approved", actor: "system", message: outcome.decision.reasons.map((r) => r.message).join(" ") });
    return capture(household, moved);
  }

  const token = randomBytes(24).toString("base64url");
  const waiting = await transitionPurchase(p.id, "checkout", "awaiting_review", {
    decision: outcome.decision,
    paypalAuthorizationId: held.id,
    paypalAmountCents,
    reviewToken: token,
    reviewExpiresAt: reviewExpiresAt(now).toISOString(),
  });
  if (!waiting) return load(household, id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "review_requested",
    actor: "system",
    message: `${outcome.decision.reasons.map((r) => r.message).join(" ")} ${household.reviewerName} has been asked to review it. If there's no answer within 24 hours, the hold is released.`,
    detail: outcome.decision,
  });
  return waiting;
}

/** Take the held money. Only called once the purchase is already marked completed. */
async function capture(household: Household, p: Purchase): Promise<Purchase> {
  try {
    const c = await paypal().captureAuthorization(p.paypalAuthorizationId!, `capture-${p.id}`);
    await transitionPurchase(p.id, "completed", "completed", { paypalCaptureId: c.id });
    await logEvent({
      householdId: household.id,
      purchaseId: p.id,
      type: "captured",
      actor: "paypal",
      message: `PayPal payment completed: ${c.amount.value} ${c.amount.currency_code}. Retailer order placement is simulated in this prototype.`,
      detail: { captureId: c.id, status: c.status },
    });
  } catch (err) {
    // Captures carry a fixed PayPal-Request-Id, so a retry can never charge twice; on failure, release the hold.
    await transitionPurchase(p.id, "completed", "failed");
    await paypal().voidAuthorization(p.paypalAuthorizationId!, `void-${p.id}`).catch(() => undefined);
    await logEvent({
      householdId: household.id,
      purchaseId: p.id,
      type: "capture_error",
      actor: "paypal",
      message: "PayPal couldn't complete the payment, so the hold was released and nothing was charged.",
      detail: err instanceof PayPalError ? err.body : String(err),
    });
  }
  return (await getPurchase(p.id))!;
}

/** Release a hold and finish the purchase in the given state. */
async function release(household: Household, p: Purchase, to: "declined" | "expired" | "canceled", message: string, actor: "shopper" | "reviewer" | "system") {
  const moved = await transitionPurchase(p.id, p.state, to, { reviewToken: null });
  if (!moved) return (await getPurchase(p.id))!;
  if (p.paypalAuthorizationId) {
    try {
      await paypal().voidAuthorization(p.paypalAuthorizationId, `void-${p.id}`);
    } catch (err) {
      // Already voided or expired at PayPal is fine: either way nothing is charged.
      if (!(err instanceof PayPalError && err.status === 422)) throw err;
    }
  }
  await logEvent({ householdId: household.id, purchaseId: p.id, type: to, actor, message });
  return moved;
}

/** The reviewer's answer, from their private link. */
export async function reviewerDecides(household: Household, p: Purchase, decision: "approve" | "decline"): Promise<Purchase> {
  p = await expireIfOverdue(household, p);
  if (p.state !== "awaiting_review") throw new FlowError(`This purchase is already ${p.state}.`, 409);

  if (decision === "decline") {
    return release(household, p, "declined", `${household.reviewerName} declined. The PayPal hold was released; nothing was charged.`, "reviewer");
  }
  const moved = await transitionPurchase(p.id, "awaiting_review", "completed", { reviewToken: null });
  if (!moved) return (await getPurchase(p.id))!;
  const exception = p.decision.outcome === "exception" ? " as an exception" : "";
  await logEvent({ householdId: household.id, purchaseId: p.id, type: "approved", actor: "reviewer", message: `${household.reviewerName} approved${exception}.` });
  return capture(household, moved);
}

export async function cancelPurchase(household: Household, id: string): Promise<Purchase> {
  const p = await load(household, id);
  if (!["evaluated", "checkout", "awaiting_review"].includes(p.state)) throw new FlowError(`This purchase is already ${p.state}.`, 409);
  return release(household, p, "canceled", `${household.shopperName} canceled. Nothing was charged.`, "shopper");
}

/** Waiting reviews past their deadline release their hold. Checked whenever a purchase is read. */
export async function expireIfOverdue(household: Household, p: Purchase, now = new Date()): Promise<Purchase> {
  if (p.state !== "awaiting_review" || !p.reviewExpiresAt || now.getTime() < Date.parse(p.reviewExpiresAt)) return p;
  return release(household, p, "expired", `${household.reviewerName} didn't respond within 24 hours, so the PayPal hold was released. Nothing was charged.`, "system");
}

export async function expireOverdue(household: Household): Promise<void> {
  for (const p of await listPurchases(household.id, 200)) await expireIfOverdue(household, p);
}

export { load as loadPurchase };
