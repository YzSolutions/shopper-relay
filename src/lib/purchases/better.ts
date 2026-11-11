// When a reviewer is about to say no to a held purchase, ShopperRelay looks for a
// product that does the same job, within the shopper's own rules and at a lower
// price. Code decides what qualifies; Gemini only chooses the closest match among
// those. The reviewer can decline and send it in one step. The shopper still buys
// it the normal way, so nothing here touches payment.

import { z } from "zod";
import { reasonWords } from "@/config/relationships";
import { generateJson } from "../ai/gemini";
import { RECURRING_WORDS } from "../ai/terms";
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

const Kind = z.object({ query: z.string().describe('the kind of product to search for, with no brand or model, 2 to 7 words, e.g. "digital upper arm blood pressure monitor"') });
const Pick = z.object({ listing: z.string().describe('the id of the closest match, like "L2", or "" if none truly does the same job') });

/** Whether a listing qualifies: cheaper, the same kind of thing, nothing recurring mentioned, and within the shopper's rules right now. */
async function judgeFor(household: Household, p: Purchase) {
  const [state, purchases] = await Promise.all([getRulesState(household.id), listPurchases(household.id, 200)]);
  const rules = activeRules(state);
  const history = historyFrom(purchases.map(summarize), p.id);
  return (product: Product): BetterOption | null => {
    const offer = bestOffer(product);
    if (!offer || offer.priceCents >= p.reviewedCents) return null;
    if (RECURRING_WORDS.test([product.title, product.description, ...product.keyFeatures].join(" "))) return null;
    // Catalog listings carry no terms, so nothing recurring is known: "no monthly fee listed", the same as everywhere else.
    const category = resolveCategory({ catalogPath: product.categoryPath, title: product.title, custom: rules.custom, recurring: "no" });
    if (!p.category.categories.includes(category.primary)) return null;
    const decision = evaluatePurchase(rules, { amountCents: offer.priceCents, categories: category.categories }, history, reasonWords(household));
    if (decision.outcome !== "auto") return null;
    const shown = household.hideBrands && !product.imageHidden ? anonymizeProduct(product) : product;
    return { sourceId: product.sourceId, title: shown.title, merchant: bestOffer(shown)?.merchant ?? offer.merchant, priceCents: offer.priceCents };
  };
}

/** The listing that best does the same job, among those that qualify, or null. Only while a held purchase is waiting. */
export async function findBetter(household: Household, p: Purchase): Promise<BetterOption | null> {
  if (p.flow !== "hold" || p.state !== "awaiting_review") return null;
  const about = `Product: ${p.item.title}\nAbout it: ${p.terms?.plainSummary ?? "(nothing more known)"}`;
  const { data: kind } = await generateJson({
    task: "better-kind-v1",
    speed: "quick",
    schema: Kind,
    system: "Someone is buying the product described. Write what to type into a store's search box to find other makers' versions of the same kind of product. Keep what it does and how it works, so a digital, automatic product stays digital and automatic. Leave out the brand, the model, and any membership or subscription.",
    parts: [{ text: about }],
  });
  const products = await createChannel3Source().search(kind.query, { limit: 12, maxPriceCents: p.reviewedCents - 1 });
  const judge = await judgeFor(household, p);
  const options = products.flatMap((product) => {
    const option = judge(product);
    return option ? [{ product, option }] : [];
  });
  if (!options.length) return null;

  const lines = options.map(({ product, option }, i) => `L${i + 1} | ${product.title} | ${formatCents(option.priceCents)} | ${product.keyFeatures.slice(0, 5).join("; ")} | ${(product.description ?? "").slice(0, 200)}`);
  const { data: pick } = await generateJson({
    task: "better-pick-v2",
    speed: "quick",
    schema: Pick,
    system: "Someone is buying the product described, but it comes with a repeat charge. Choose the listing that does the same job just as well, so they lose nothing they need. The repeat charge and anything that comes only with it (a membership, a subscription, an app plan) is exactly what they want to avoid, so a listing without it still does the same job. It must work the same way: never a manual version of a digital product, an accessory, a part, a toy, or a lookalike for a different use. Price doesn't matter: never choose a listing because it's cheap. If none truly does the same job, answer with an empty listing.",
    parts: [{ text: `${about}\n\nListings:\n${lines.join("\n")}` }],
  });
  return options[Number(pick.listing.replace(/\D/g, "") || 0) - 1]?.option ?? null;
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
