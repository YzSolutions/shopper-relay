import type { NextRequest } from "next/server";
import { anonymizeProduct } from "@/lib/catalog/anonymize";
import { createChannel3Source } from "@/lib/catalog/channel3";
import { bestOffer, compareFor } from "@/lib/catalog/compare";
import { FlowError } from "@/lib/purchases/service";
import { handle } from "@/lib/http";
import { activeRules, evaluatePurchase, resolveCategory } from "@/lib/policy";
import { historyFrom } from "@/lib/purchases/lifecycle";
import { demoHousehold, getRulesState } from "@/lib/store/households";
import { listPurchases, summarize } from "@/lib/store/purchases";

/**
 * Search the catalog and say, for each result, which rule it falls under and
 * what would happen if the shopper chose its best offer. Only a preview: the
 * real decision is made again against PayPal's held amount.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) throw new FlowError("Type what you're looking for.");
    if (q.length > 200) throw new FlowError("That search is too long.");

    const household = await demoHousehold();
    const [products, state, purchases] = await Promise.all([
      createChannel3Source().search(q, { limit: 12 }),
      getRulesState(household.id),
      listPurchases(household.id, 200),
    ]);
    const rules = activeRules(state);
    const history = historyFrom(purchases.map(summarize));

    const results = products.map((product) => {
      const category = resolveCategory({ catalogPath: product.categoryPath, recurring: "no" });
      const offer = bestOffer(product);
      const preview = offer
        ? evaluatePurchase(rules, { amountCents: offer.priceCents, categories: category.categories }, history, {
            shopperName: household.shopperName,
            reviewerName: household.reviewerName,
          })
        : null;
      const comparison = compareFor(product, products);
      return {
        // Comparisons use the real data; demo mode only changes what is shown.
        product: household.hideBrands ? anonymizeProduct(product) : product,
        category,
        preview,
        sameProductCount: comparison.sameProduct.length,
      };
    });
    return { query: q, results };
  });
}
