// The purchase flows, end to end (see lifecycle.ts for the states). Each step
// re-reads the purchase and moves it with a guarded state change, so double
// clicks and races can't charge twice; PayPal request ids back that up.

import { randomBytes, randomUUID } from "node:crypto";
import { brand } from "@/config/brand";
import { reasonWords, RELATIONSHIPS } from "@/config/relationships";
import { classifyProduct } from "../ai/products";
import { recurringFinding, type AiTerms } from "../ai/terms";
import { anonymizeProduct } from "../catalog/anonymize";
import { createChannel3Source } from "../catalog/channel3";
import { bestOffer } from "../catalog/compare";
import type { Product } from "../catalog/types";
import { formatCents, numberToCents, parseToCents } from "../money";
import { activeRules, categoryLabel, checkPayPalAmount, evaluatePurchase, resolveCategory, type CategoryId, type RecurringFinding } from "../policy";
import { configFromEnv, createPayPalClient, firstAuthorization, PayPalError, type PayPalClient } from "../paypal/client";
import { getCheck } from "../store/checks";
import { logEvent } from "../store/events";
import { getRulesState, type Household } from "../store/households";
import { clearStanding, getStanding, saveStanding } from "../store/standing";
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
import { decideAfterHold, historyFrom, isFinal, OTPA_MAX_DAYS, otpaAllows, REQUEST_WINDOW_MS, reviewExpiresAt, type Otpa } from "./lifecycle";

export class FlowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** A PayPal amount the way the rest of the app writes money: "$14.99". */
const paypalMoney = (a: { value: string; currency_code: string }) => formatCents(parseToCents(a.value), a.currency_code);

let paypalClient: PayPalClient | null = null;
const paypal = () => (paypalClient ??= createPayPalClient(configFromEnv()));

async function historyFor(household: Household, excludeId?: string) {
  return historyFrom((await listPurchases(household.id, 200)).map(summarize), excludeId);
}

async function evaluateFor(household: Household, amountCents: number, categories: Purchase["category"]["categories"], excludeId?: string) {
  const rules = activeRules(await getRulesState(household.id));
  return evaluatePurchase(rules, { amountCents, categories }, await historyFor(household, excludeId), reasonWords(household));
}

async function categorize(
  household: Household,
  item: { categoryPath: string[]; title: string },
  fallback: () => Promise<{ category: CategoryId; confidence: number }>,
  recurring: RecurringFinding,
) {
  const custom = activeRules(await getRulesState(household.id)).custom;
  const evidence = { catalogPath: item.categoryPath, title: item.title, custom, recurring };
  let resolution = resolveCategory(evidence);
  if (resolution.basis === "ambiguous" && !item.categoryPath.length) {
    // No catalog category at all: ask the AI, and let resolveCategory decide how far to trust it.
    const ai = await fallback().catch(() => null);
    resolution = resolveCategory({ ...evidence, ai });
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
  const category = await categorize(household, real, () => classifyProduct(product), recurring);
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

/** What the rules say about a checked checkout, before anything is chosen. Null when the total couldn't be read. */
export async function decideChecked(household: Household, terms: AiTerms) {
  if (!terms.readable || terms.totalDueTodayDollars === null) return null;
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
  const category = await categorize(household, pseudoProduct, () => classifyProduct(pseudoProduct), recurring);
  const reviewedCents = numberToCents(terms.totalDueTodayDollars);
  const decision = await evaluateFor(household, reviewedCents, category.categories);
  return { title, recurring, category, reviewedCents, decision };
}

/** Choose an item the shopper checked from a screenshot ("Check Before You Buy"). */
export async function chooseCheckedItem(household: Household, checkId: string): Promise<Purchase> {
  const terms = await getCheck(household.id, checkId);
  if (!terms) throw new FlowError("That check wasn't found.", 404);
  const decided = await decideChecked(household, terms);
  if (!decided) throw new FlowError("The total due today couldn't be read from that screenshot, so it can't be bought from here.", 422);
  const { title, recurring, category, reviewedCents, decision } = decided;
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
    modelNumber: p.modelNumber,
    ...(p.imageHidden && { imageHidden: true }),
  };
}

async function recordChoice(
  household: Household,
  c: Pick<Purchase, "item" | "reviewedCents" | "currency" | "category" | "recurring" | "terms" | "decision">,
): Promise<Purchase> {
  const state = c.decision.outcome === "blocked" ? "blocked" : "evaluated";
  const flow = RELATIONSHIPS[household.relationship].flow;
  const purchase = await insertPurchase({ householdId: household.id, state, ...c, flow, reviewerName: c.decision.reviewer });
  const label = categoryLabel(c.category.primary);
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

/** This household's purchase, with an overdue hold or authorization already ended. */
export async function loadCurrent(household: Household, id: string): Promise<Purchase> {
  return expireIfOverdue(household, await load(household, id));
}

const reviewerOf = (household: Household, p: Purchase) => p.reviewerName ?? household.reviewerName;
const describe = (p: Purchase) => `${p.item.title}${p.item.merchant ? ` (${p.item.merchant})` : ""}`;
const newToken = () => randomBytes(24).toString("base64url");

// ---------------------------------------------------------------------------
// "hold" flow: the shopper pays; PayPal holds it while the reviewer looks.
// ---------------------------------------------------------------------------

/** Create the PayPal order. The buyer approves it in PayPal's own window; no money moves yet. */
export async function startCheckout(household: Household, id: string): Promise<{ orderId: string }> {
  let p = await load(household, id);
  if (p.flow !== "hold") throw new FlowError(`${household.shopperName} doesn't pay for this; ${reviewerOf(household, p)} does.`, 409);
  if (p.state === "evaluated") {
    p = (await transitionPurchase(p.id, "evaluated", "checkout")) ?? (await load(household, id));
  }
  if (p.state !== "checkout") throw new FlowError(`This purchase is ${p.state.replace("_", " ")} and can't be paid for.`, 409);

  const order = await paypal().createAuthorizeOrder({
    amountCents: p.reviewedCents,
    currency: p.currency,
    description: describe(p),
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

/** Place the hold for an approved order and read it back from PayPal. Null if PayPal didn't place it. */
async function placeHold(p: Purchase, orderId: string) {
  const authorized = await paypal().authorizeOrder(orderId, `authorize-${p.id}-${orderId}`);
  const auth = firstAuthorization(authorized);
  if (!auth || (auth.status !== "CREATED" && auth.status !== "PENDING")) return { held: null, order: authorized };
  // Read the hold back from PayPal; this amount is the one that counts.
  return { held: await paypal().getAuthorization(auth.id), order: authorized };
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

  const { held, order } = await placeHold(p, orderId);
  if (!held) {
    const failed = await transitionPurchase(p.id, "checkout", "failed");
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "failed", actor: "paypal", message: "PayPal didn't place the hold, so nothing was charged.", detail: { order } });
    return failed ?? load(household, id);
  }
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "held",
    actor: "paypal",
    message: `PayPal placed a hold of ${paypalMoney(held.amount)}. Nothing has been charged yet.`,
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
    ruleOwner: RELATIONSHIPS[household.relationship].ruleOwner,
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

  const reviewer = outcome.decision.reviewer;
  const waiting = await transitionPurchase(p.id, "checkout", "awaiting_review", {
    decision: outcome.decision,
    reviewerName: reviewer,
    paypalAuthorizationId: held.id,
    paypalAmountCents,
    reviewToken: newToken(),
    reviewExpiresAt: reviewExpiresAt(now).toISOString(),
  });
  if (!waiting) return load(household, id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "review_requested",
    actor: "system",
    message: `${outcome.decision.reasons.map((r) => r.message).join(" ")} ${reviewer} has been asked to review it. If there's no answer within 24 hours, the hold is released.`,
    detail: outcome.decision,
  });
  return waiting;
}

/** Take the held money (all of it, or `amountCents` of it). Only called once the purchase is already marked completed. */
async function capture(household: Household, p: Purchase, amountCents?: number): Promise<Purchase> {
  try {
    const c = await paypal().captureAuthorization(
      p.paypalAuthorizationId!,
      `capture-${p.id}`,
      amountCents === undefined ? undefined : { cents: amountCents, currency: p.currency },
    );
    // Record what PayPal says it took; screens show this, never the hold or the listed price.
    await transitionPurchase(p.id, "completed", "completed", { paypalCaptureId: c.id, paypalCapturedCents: parseToCents(c.amount.value) });
    await logEvent({
      householdId: household.id,
      purchaseId: p.id,
      type: "captured",
      actor: "paypal",
      message: `PayPal payment completed: ${paypalMoney(c.amount)}. Placing the order with the store is simulated in this prototype.`,
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

/** Finish a purchase without paying, releasing any PayPal hold. */
async function release(household: Household, p: Purchase, to: "declined" | "expired" | "canceled", message: string, actor: "shopper" | "reviewer" | "system", by?: string) {
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
  await logEvent({ householdId: household.id, purchaseId: p.id, type: to, actor, message, by });
  return moved;
}

// ---------------------------------------------------------------------------
// "request" flow: the shopper asks; the reviewer approves and pays, or
// (personal shopper) grants a One-Time Purchase Authorization.
// ---------------------------------------------------------------------------

/** The shopper sends the request. The rules run again now, against the latest spending. */
export async function sendRequest(household: Household, id: string): Promise<Purchase> {
  const p = await load(household, id);
  if (p.flow !== "request") throw new FlowError("This purchase is paid for at checkout, not requested.", 409);
  if (p.state === "requested") return p;
  if (p.state !== "evaluated") throw new FlowError(`This purchase is already ${p.state}.`, 409);

  const decision = await evaluateFor(household, p.reviewedCents, p.category.categories, p.id);
  if (decision.outcome === "blocked") {
    const blocked = await transitionPurchase(p.id, "evaluated", "blocked", { decision });
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "blocked", actor: "system", message: decision.reasons.map((r) => r.message).join(" ") });
    return blocked ?? load(household, id);
  }
  const reviewer = decision.reviewer;
  const sent = await transitionPurchase(p.id, "evaluated", "requested", {
    decision,
    reviewerName: reviewer,
    reviewToken: newToken(),
    reviewExpiresAt: new Date(Date.now() + REQUEST_WINDOW_MS).toISOString(),
  });
  if (!sent) return load(household, id);
  const flag = decision.outcome === "exception" ? ` ${decision.reasons.map((r) => r.message).join(" ")}` : "";
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "requested",
    actor: "shopper",
    message: `${household.shopperName} asked ${reviewer} for ${p.item.title} (${formatCents(p.reviewedCents)}).${flag} Nothing is paid until ${reviewer} approves.`,
    detail: decision,
  });
  return sent;
}

export interface OtpaTerms {
  maxCents: number;
  details: string;
  expiresInDays: number;
}

/**
 * The reviewer starts paying: either for this exact purchase now, or a hold
 * up to their maximum price for a One-Time Purchase Authorization.
 */
export async function reviewerStartPayment(household: Household, p: Purchase, kind: "pay" | "otpa", terms?: OtpaTerms): Promise<{ orderId: string }> {
  p = await expireIfOverdue(household, p);
  if (p.flow !== "request" || p.state !== "requested") throw new FlowError(`This request is ${p.state} and can't be paid for.`, 409);
  const reviewer = reviewerOf(household, p);

  let otpa: Otpa | null = null;
  let amountCents = p.reviewedCents;
  if (kind === "otpa") {
    if (!RELATIONSHIPS[household.relationship].otpa) throw new FlowError("One-time authorizations aren't available here.", 400);
    if (!terms) throw new FlowError("Set the most you'll pay and when it expires.", 400);
    const days = Math.min(Math.max(Math.round(terms.expiresInDays), 1), OTPA_MAX_DAYS);
    otpa = {
      status: "draft",
      maxCents: terms.maxCents,
      details: terms.details.trim().slice(0, 160),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      product: { sourceId: p.item.sourceId, title: p.item.title, brand: p.item.brand, modelNumber: p.item.modelNumber ?? null },
    };
    amountCents = terms.maxCents;
  }

  const order = await paypal().createAuthorizeOrder({
    amountCents,
    currency: p.currency,
    description: kind === "otpa" ? `Up to ${formatCents(amountCents)}: ${describe(p)}` : describe(p),
    customId: p.id,
    brandName: brand.name,
    requestId: `order-${p.id}-${randomUUID()}`,
  });
  await setPayPalOrder(p.id, order.id, otpa);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "reviewer_checkout",
    actor: "reviewer",
    by: reviewer,
    message:
      kind === "otpa"
        ? `${reviewer} is authorizing ${household.shopperName} to buy it once for up to ${formatCents(amountCents)}.`
        : `${reviewer} is approving and paying ${formatCents(amountCents)} with PayPal.`,
    detail: { orderId: order.id },
  });
  return { orderId: order.id };
}

/** The reviewer approved in PayPal: pay for the purchase now, or activate the one-time authorization. */
export async function reviewerCompletePayment(household: Household, p: Purchase, orderId: string): Promise<Purchase> {
  if (p.state !== "requested") {
    if (isFinal(p.state) || p.state === "hunting") return p; // already handled
    throw new FlowError(`This request is ${p.state}.`, 409);
  }
  if (p.paypalOrderId !== orderId) throw new FlowError("That PayPal order doesn't belong to this request.", 400);
  const reviewer = reviewerOf(household, p);
  const draft = p.otpa?.status === "draft" ? p.otpa : null;

  const { held, order } = await placeHold(p, orderId);
  if (!held) {
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "failed", actor: "paypal", message: "PayPal didn't accept the payment. Nothing was charged. You can try again.", detail: { order } });
    throw new FlowError("PayPal didn't accept the payment. Nothing was charged.", 402);
  }
  const expected = draft ? draft.maxCents : p.reviewedCents;
  const amount = checkPayPalAmount(expected, held.amount, p.currency);
  if (!amount.ok) {
    await paypal().voidAuthorization(held.id, `void-${p.id}`).catch(() => undefined);
    const failed = await transitionPurchase(p.id, "requested", "failed", { paypalAuthorizationId: held.id });
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "voided", actor: "system", message: `${amount.message} The hold was released.` });
    return failed ?? (await getPurchase(p.id))!;
  }

  if (draft) {
    const active: Otpa = { ...draft, status: "active", authorizationId: held.id };
    const hunting = await transitionPurchase(p.id, "requested", "hunting", {
      otpa: active,
      paypalAuthorizationId: held.id,
      paypalAmountCents: amount.paypalCents,
      reviewExpiresAt: active.expiresAt,
    });
    if (!hunting) return (await getPurchase(p.id))!;
    await logEvent({
      householdId: household.id,
      purchaseId: p.id,
      type: "otpa_granted",
      actor: "reviewer",
      by: reviewer,
      message: `${reviewer} authorized ${household.shopperName} to buy ${p.item.title} once, for ${formatCents(active.maxCents)} or less${active.details ? ` (${active.details})` : ""}, by ${new Date(active.expiresAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}. PayPal is holding ${formatCents(active.maxCents)}; only the actual price will be charged.`,
      detail: active,
    });
    return hunting;
  }

  // Paying now: the rules run once more against PayPal's amount. The reviewer is
  // approving knowingly, so an over-budget exception goes ahead; a blocked one doesn't.
  const decision = await evaluateFor(household, amount.paypalCents, p.category.categories, p.id);
  if (decision.outcome === "blocked") {
    await paypal().voidAuthorization(held.id, `void-${p.id}`).catch(() => undefined);
    const blocked = await transitionPurchase(p.id, "requested", "blocked", { decision, paypalAuthorizationId: held.id });
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "blocked", actor: "system", message: `${decision.reasons.map((r) => r.message).join(" ")} The hold was released.` });
    return blocked ?? (await getPurchase(p.id))!;
  }
  const moved = await transitionPurchase(p.id, "requested", "completed", {
    decision,
    paypalAuthorizationId: held.id,
    paypalAmountCents: amount.paypalCents,
    reviewToken: null,
  });
  if (!moved) return (await getPurchase(p.id))!;
  const exception = decision.outcome === "exception" ? " as an exception" : "";
  await logEvent({ householdId: household.id, purchaseId: p.id, type: "approved", actor: "reviewer", by: reviewer, message: `${reviewer} approved${exception} and paid with PayPal.` });
  return capture(household, moved);
}

export interface OtpaOption {
  sourceId: string;
  title: string;
  merchant: string;
  priceCents: number;
  currency: string;
  available: boolean;
  allowed: boolean;
  reason: string | null;
}

/** Listings the shopper could buy under the authorization: this product at every store that carries it. */
export async function otpaOptions(household: Household, id: string): Promise<OtpaOption[]> {
  const p = await expireIfOverdue(household, await load(household, id));
  if (p.state !== "hunting" || !p.otpa?.product.sourceId) return [];
  const real = await createChannel3Source().get(p.otpa.product.sourceId);
  if (!real) return [];
  const shown = household.hideBrands ? anonymizeProduct(real) : real;
  return real.offers.map((o, i) => {
    const check = otpaAllows(p.otpa!, { sourceId: real.sourceId, brand: real.brand, modelNumber: real.modelNumber, priceCents: o.priceCents, available: o.available });
    return {
      sourceId: real.sourceId,
      title: shown.title,
      merchant: shown.offers[i].merchant,
      priceCents: o.priceCents,
      currency: o.currency,
      available: o.available,
      allowed: check.ok,
      reason: check.ok ? null : check.reason,
    };
  });
}

/**
 * The shopper (or the AI shopper, `by: "agent"`) found it. ShopperRelay checks it
 * is the authorized product at or under the price, then takes exactly that amount
 * from the hold. PayPal releases the rest and refuses any second capture: one purchase, once.
 */
export async function buyWithOtpa(household: Household, id: string, sourceId: string, merchant: string, by: "shopper" | "agent" = "shopper"): Promise<Purchase> {
  const p = await expireIfOverdue(household, await load(household, id));
  if (p.state !== "hunting" || !p.otpa) throw new FlowError(`This authorization is ${p.state === "hunting" ? "not ready" : p.state}.`, 409);
  const real = await createChannel3Source().get(sourceId);
  if (!real) throw new FlowError("That listing is no longer available.", 404);
  const shown = household.hideBrands ? anonymizeProduct(real) : real;
  const i = real.offers.findIndex((o, k) => o.merchant === merchant || shown.offers[k].merchant === merchant);
  if (i < 0) throw new FlowError("That store no longer lists it.", 404);
  const offer = real.offers[i];

  const check = otpaAllows(p.otpa, { sourceId: real.sourceId, brand: real.brand, modelNumber: real.modelNumber, priceCents: offer.priceCents, available: offer.available });
  if (!check.ok) throw new FlowError(check.reason, 409);

  const item = itemFromProduct(shown, shown.offers[i].merchant, offer.url);
  const moved = await transitionPurchase(p.id, "hunting", "completed", {
    item,
    reviewedCents: offer.priceCents,
    otpa: { ...p.otpa, status: "used", usedAt: new Date().toISOString() },
    reviewToken: null,
  });
  if (!moved) return (await getPurchase(p.id))!;
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "otpa_used",
    actor: by,
    message: `${by === "agent" ? "The AI shopper" : household.shopperName} found it for ${formatCents(offer.priceCents)} at ${item.merchant}, within ${reviewerOf(household, p)}'s ${formatCents(p.otpa.maxCents)}. Checked: same product, at or under the price, before the authorization expired.`,
  });
  return capture(household, moved, offer.priceCents);
}

// ---------------------------------------------------------------------------
// Standing permission (request flow): the payer saves their PayPal once, and
// the shopper can then buy what the payer's own rules allow without asking.
// Every purchase still goes hold → amount check → rules again → capture.
// ---------------------------------------------------------------------------

function assertPayerPays(household: Household) {
  if (RELATIONSHIPS[household.relationship].payer !== "reviewer") {
    throw new FlowError(`${household.shopperName} pays with their own PayPal here, so there's nothing to set up.`, 400);
  }
}

/** The payer starts saving their PayPal. They approve it in PayPal's own window; nothing is charged. */
export async function startStandingSetup(household: Household, origin: string): Promise<{ setupTokenId: string }> {
  assertPayerPays(household);
  const token = await paypal().createPayPalSetupToken({
    brandName: brand.name,
    description: `Lets ${household.shopperName} buy what ${household.reviewerName}'s rules allow`,
    returnUrl: `${origin}/inbox`,
    cancelUrl: `${origin}/inbox`,
    requestId: `setup-${household.id}-${randomUUID()}`,
  });
  return { setupTokenId: token.id };
}

/** The payer approved in PayPal: save the payment method and turn standing permission on. */
export async function confirmStanding(household: Household, setupTokenId: string) {
  assertPayerPays(household);
  const token = await paypal().createPaymentToken(setupTokenId);
  const source = token.payment_source;
  const method = source?.card ? "card" : "paypal";
  const payerLabel = source?.paypal?.email_address ?? (source?.card?.last_digits ? `Card ending ${source.card.last_digits}` : null);
  const replaced = await saveStanding(household.id, { paymentTokenId: token.id, method, payerLabel });
  if (replaced) await paypal().deletePaymentToken(replaced).catch(() => undefined);
  const { shopperName: shopper, reviewerName: reviewer } = household;
  await logEvent({
    householdId: household.id,
    type: "standing_on",
    actor: "reviewer",
    message: `${reviewer} turned on standing permission. ${shopper} can now buy what ${reviewer}'s rules allow, paid with ${reviewer}'s saved PayPal.`,
  });
  return standingView(household);
}

/** Turn standing permission off and forget the saved payment method at PayPal. */
export async function revokeStanding(household: Household) {
  const removed = await clearStanding(household.id);
  if (removed) {
    // Already gone at PayPal is fine.
    await paypal().deletePaymentToken(removed).catch(() => undefined);
    await logEvent({
      householdId: household.id,
      type: "standing_off",
      actor: "reviewer",
      message: `${household.reviewerName} turned off standing permission. Everything goes to ${household.reviewerName} again.`,
    });
  }
  return standingView(household);
}

/** What the screens may know: whether it's on and since when. Never the token. */
export async function standingView(household: Household): Promise<{ since: string; payerLabel: string | null } | null> {
  const s = await getStanding(household.id);
  return s ? { since: s.since, payerLabel: s.payerLabel } : null;
}

/** The shopper buys within the payer's rules, paid with the payer's saved PayPal. */
export async function buyWithStanding(household: Household, id: string): Promise<Purchase> {
  const p = await load(household, id);
  const { shopperName: shopper, reviewerName: payer } = household;
  if (p.flow !== "request") throw new FlowError("This purchase is paid for at checkout.", 409);
  if (p.state !== "evaluated") {
    if (p.standing) return p; // already bought (double click)
    throw new FlowError(`This purchase is already ${p.state}.`, 409);
  }
  const standing = await getStanding(household.id);
  if (!standing) throw new FlowError(`${payer} hasn't turned on standing permission, so send it to ${payer} instead.`, 409);

  // The rules run again now, against the latest spending.
  const decision = await evaluateFor(household, p.reviewedCents, p.category.categories, p.id);
  if (decision.outcome !== "auto") {
    await transitionPurchase(p.id, "evaluated", "evaluated", { decision });
    throw new FlowError(`The rules now say ${payer} decides on this one, so send it to ${payer} instead.`, 409);
  }
  const moved = await transitionPurchase(p.id, "evaluated", "checkout", { decision, standing: true });
  if (!moved) return load(household, id);

  const order = await paypal().createSavedPaymentAuthorization({
    paymentTokenId: standing.paymentTokenId,
    method: standing.method,
    amountCents: p.reviewedCents,
    currency: p.currency,
    description: describe(p),
    customId: p.id,
    requestId: `standing-${p.id}`, // one order per purchase, however often this is retried
  });
  await setPayPalOrder(p.id, order.id);
  const auth = firstAuthorization(order);
  if (!auth || (auth.status !== "CREATED" && auth.status !== "PENDING")) {
    const failed = await transitionPurchase(p.id, "checkout", "failed");
    await logEvent({
      householdId: household.id,
      purchaseId: p.id,
      type: "failed",
      actor: "paypal",
      message: `PayPal didn't place a hold on ${payer}'s saved PayPal, so nothing was charged.`,
      detail: { order },
    });
    return failed ?? load(household, id);
  }
  const held = await paypal().getAuthorization(auth.id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "held",
    actor: "paypal",
    message: `PayPal placed a hold of ${paypalMoney(held.amount)} on ${payer}'s saved PayPal. Nothing has been charged yet.`,
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
    shopperName: shopper,
    reviewerName: payer,
    ruleOwner: "reviewer",
    flow: "request",
  });
  const paypalAmountCents = outcome.amount.paypalCents ?? undefined;

  if (outcome.action !== "capture") {
    // A mismatched amount, or rules that changed in the last second: release it and let the payer decide.
    await paypal().voidAuthorization(held.id, `void-${p.id}`);
    const next = outcome.action === "void" ? outcome.next : "failed";
    const done = await transitionPurchase(p.id, "checkout", next, {
      paypalAuthorizationId: held.id,
      paypalAmountCents,
      ...(outcome.decision && { decision: outcome.decision }),
    });
    const why = outcome.action === "void" ? outcome.message : `The rules now say ${payer} decides.`;
    await logEvent({ householdId: household.id, purchaseId: p.id, type: "voided", actor: "system", message: `${why} The hold was released; nothing was charged.` });
    return done ?? load(household, id);
  }

  const completed = await transitionPurchase(p.id, "checkout", "completed", { decision: outcome.decision, paypalAuthorizationId: held.id, paypalAmountCents });
  if (!completed) return load(household, id);
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "approved",
    actor: "system",
    message: `${outcome.decision.reasons.map((r) => r.message).join(" ")} ${shopper} bought it with ${payer}'s standing permission; ${payer} gets a message.`,
  });
  return capture(household, completed);
}

// ---------------------------------------------------------------------------
// Answers, cancellations and timeouts, for both flows.
// ---------------------------------------------------------------------------

/** The reviewer's answer from their private link: approve a held purchase, decline, or cancel an authorization. */
export async function reviewerDecides(household: Household, p: Purchase, decision: "approve" | "decline" | "cancel"): Promise<Purchase> {
  p = await expireIfOverdue(household, p);
  const reviewer = reviewerOf(household, p);

  if (decision === "cancel") {
    if (p.state !== "hunting") throw new FlowError(`There's no active authorization to cancel; this is ${p.state}.`, 409);
    return release(household, p, "canceled", `${reviewer} canceled the authorization. PayPal released the hold; nothing was charged.`, "reviewer");
  }
  if (p.state !== "awaiting_review" && p.state !== "requested") throw new FlowError(`This purchase is already ${p.state}.`, 409);

  if (decision === "decline") {
    const paid = p.state === "awaiting_review" ? " The PayPal hold was released; nothing was charged." : " Nothing was charged.";
    return release(household, p, "declined", `${reviewer} declined.${paid}`, "reviewer", reviewer);
  }
  if (p.state === "requested") throw new FlowError(`${reviewer} approves this by paying with PayPal.`, 409);
  const moved = await transitionPurchase(p.id, "awaiting_review", "completed", { reviewToken: null });
  if (!moved) return (await getPurchase(p.id))!;
  const exception = p.decision.outcome === "exception" ? " as an exception" : "";
  await logEvent({ householdId: household.id, purchaseId: p.id, type: "approved", actor: "reviewer", by: reviewer, message: `${reviewer} approved${exception}.` });
  return capture(household, moved);
}

export async function cancelPurchase(household: Household, id: string): Promise<Purchase> {
  const p = await load(household, id);
  if (!["evaluated", "checkout", "awaiting_review", "requested", "hunting"].includes(p.state)) throw new FlowError(`This purchase is already ${p.state}.`, 409);
  const message =
    p.state === "hunting"
      ? `${household.shopperName} stopped looking. PayPal released ${reviewerOf(household, p)}'s hold; nothing was charged.`
      : `${household.shopperName} canceled. Nothing was charged.`;
  return release(household, p, "canceled", message, "shopper");
}

/** Waiting reviews, requests and authorizations past their deadline end, releasing any hold. */
export async function expireIfOverdue(household: Household, p: Purchase, now = new Date()): Promise<Purchase> {
  const deadline = p.state === "hunting" ? p.otpa?.expiresAt : p.reviewExpiresAt;
  if (!["awaiting_review", "requested", "hunting"].includes(p.state) || !deadline || now.getTime() < Date.parse(deadline)) return p;
  const reviewer = reviewerOf(household, p);
  const message = {
    awaiting_review: `${reviewer} didn't respond within 24 hours, so the PayPal hold was released. Nothing was charged.`,
    requested: `${reviewer} didn't answer the request in time, so it closed. Nothing was charged.`,
    hunting: `The one-time authorization expired before it was used. PayPal released the hold; nothing was charged.`,
  }[p.state as "awaiting_review" | "requested" | "hunting"];
  return release(household, p, "expired", message, "system");
}

export async function expireOverdue(household: Household): Promise<void> {
  for (const p of await listPurchases(household.id, 200)) await expireIfOverdue(household, p);
}

export { load as loadPurchase };
