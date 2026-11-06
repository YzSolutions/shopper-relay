// When a reviewer is about to say no to a held purchase, ShopperRelay looks for a
// similar product the shopper's own rules let through, at a lower price. The
// reviewer can decline and send it in one step. The shopper still buys it the
// normal way, so nothing here touches payment.

import { reasonWords } from "@/config/relationships";
import { searchTerms } from "../ai/search";
import { anonymizeProduct } from "../catalog/anonymize";
import { createChannel3Source } from "../catalog/channel3";
import { bestOffer } from "../catalog/compare";
import type { Product } from "../catalog/types";
import { formatCents } from "../money";
import { activeRules, evaluatePurchase, resolveCategory } from "../policy";
import { logEvent } from "../store/events";
import { getRulesState, type Household } from "../store/households";
import { listPurchases, summarize, type Purchase } from "../store/purchases";
import { historyFrom } from "./lifecycle";
import { FlowError, reviewerDecides } from "./service";

export interface BetterOption {
  sourceId: string;
  title: string;
  merchant: string;
  priceCents: number;
}

/** Whether a listing qualifies: cheaper, the same kind of thing, and within the shopper's rules right now. */
async function judgeFor(household: Household, p: Purchase) {
  const [state, purchases] = await Promise.all([getRulesState(household.id), listPurchases(household.id, 200)]);
  const rules = activeRules(state);
  const history = historyFrom(purchases.map(summarize), p.id);
  return (product: Product): BetterOption | null => {
    const offer = bestOffer(product);
    if (!offer || offer.priceCents >= p.reviewedCents) return null;
    // Catalog listings carry no terms, so nothing recurring is known: "no monthly fee listed", the same as everywhere else.
    const category = resolveCategory({ catalogPath: product.categoryPath, title: product.title, custom: rules.custom, recurring: "no" });
    if (!p.category.categories.includes(category.primary)) return null;
    const decision = evaluatePurchase(rules, { amountCents: offer.priceCents, categories: category.categories }, history, reasonWords(household));
    if (decision.outcome !== "auto") return null;
    const shown = household.hideBrands && !product.imageHidden ? anonymizeProduct(product) : product;
    return { sourceId: product.sourceId, title: shown.title, merchant: bestOffer(shown)?.merchant ?? offer.merchant, priceCents: offer.priceCents };
  };
}

/** The best match the search returns that qualifies, or null. Only while a held purchase is waiting. */
export async function findBetter(household: Household, p: Purchase): Promise<BetterOption | null> {
  if (p.flow !== "hold" || p.state !== "awaiting_review") return null;
  const terms = await searchTerms(p.item.title);
  const products = await createChannel3Source().search(terms.query, { limit: 12, maxPriceCents: p.reviewedCents - 1 });
  const judge = await judgeFor(household, p);
  for (const product of products) {
    const option = judge(product);
    if (option) return option;
  }
  return null;
}

/** Decline, and put the better option on the shopper's screen. The listing is read again here, never taken from the browser. */
export async function declineWithBetter(household: Household, p: Purchase, sourceId: string): Promise<Purchase> {
  if (p.flow !== "hold" || p.state !== "awaiting_review") throw new FlowError("This purchase isn't waiting for an answer any more.", 409);
  const product = await createChannel3Source().get(sourceId);
  const option = product && (await judgeFor(household, p))(product);
  if (!option) throw new FlowError("That option has changed and no longer qualifies. You can still decline without it.", 409);

  const declined = await reviewerDecides(household, p, "decline");
  const reviewer = p.reviewerName ?? household.reviewerName;
  await logEvent({
    householdId: household.id,
    purchaseId: p.id,
    type: "better_sent",
    actor: "reviewer",
    by: reviewer,
    message: `${reviewer} sent ${household.shopperName} a better option: ${option.title}, ${formatCents(option.priceCents)} at ${option.merchant}.`,
    detail: option,
  });
  return declined;
}
