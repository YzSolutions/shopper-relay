import type { NextRequest } from "next/server";
import { z } from "zod";
import { reasonWords } from "@/config/relationships";
import { anonymizeProduct } from "@/lib/catalog/anonymize";
import { createChannel3Source } from "@/lib/catalog/channel3";
import { bestOffer, compareFor } from "@/lib/catalog/compare";
import type { Product } from "@/lib/catalog/types";
import { searchTerms } from "@/lib/ai/search";
import { FlowError } from "@/lib/purchases/service";
import { body, handle } from "@/lib/http";
import { activeRules, evaluatePurchase, resolveCategory } from "@/lib/policy";
import { historyFrom } from "@/lib/purchases/lifecycle";
import { getRulesState, type Household } from "@/lib/store/households";
import { currentHousehold } from "@/lib/store/current";
import { listPurchases, summarize } from "@/lib/store/purchases";

/**
 * For each product, which rule it falls under and what would happen if the
 * shopper chose its best offer, under the rules as they are right now. Only a
 * preview: the real decision is made again against PayPal's held amount.
 */
async function withPreviews(household: Household, products: Product[]) {
  const [state, purchases] = await Promise.all([getRulesState(household.id), listPurchases(household.id, 200)]);
  const rules = activeRules(state);
  const history = historyFrom(purchases.map(summarize));
  return products.map((product) => {
    const category = resolveCategory({ catalogPath: product.categoryPath, title: product.title, custom: rules.custom, recurring: "no" });
    const offer = bestOffer(product);
    const preview = offer
      ? evaluatePurchase(rules, { amountCents: offer.priceCents, categories: category.categories }, history, reasonWords(household))
      : null;
    const comparison = compareFor(product, products);
    return {
      // Comparisons use the real data; demo mode only changes what is shown.
      product: household.hideBrands && !product.imageHidden ? anonymizeProduct(product) : product,
      category,
      preview,
      sameProductCount: comparison.sameProduct.length,
    };
  });
}

/** Search the catalog. A long, chatty search is first boiled down to what to look for. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) throw new FlowError("Type what you're looking for.");
    if (q.length > 200) throw new FlowError("That search is too long.");

    const household = await currentHousehold();
    const terms = await searchTerms(q);
    const products = await createChannel3Source().search(terms.query, { limit: 12, maxPriceCents: terms.maxPriceCents ?? undefined });
    return { query: q, lookedFor: terms.query === q ? null : terms.query, maxPriceCents: terms.maxPriceCents, results: await withPreviews(household, products) };
  });
}

const Recheck = z.object({
  products: z
    .array(
      z.looseObject({
        sourceId: z.string(),
        title: z.string(),
        categoryPath: z.array(z.string()),
        offers: z.array(z.looseObject({ priceCents: z.number().int(), available: z.boolean() })),
      }),
    )
    .max(30),
});

/**
 * The same products checked again under the current rules, for results shown
 * again after the shopper comes back to the page (the rules may have changed).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { products } = await body(req, Recheck);
    return { results: await withPreviews(await currentHousehold(), products as unknown as Product[]) };
  });
}
