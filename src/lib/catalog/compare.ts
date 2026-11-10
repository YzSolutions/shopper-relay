import type { Offer, Product } from "./types";

// "Same product" is a factual claim, so it needs evidence: the source grouped
// the listings under one product, or the brand and model number match exactly.
// Everything else is only "similar", and is never called equivalent.

export interface SameListing {
  product: Product;
  offer: Offer;
  basis: "same_catalog_product" | "same_brand_and_model";
}

export interface Comparison {
  selected: Product;
  /** Other places to buy this exact product, cheapest first. */
  sameProduct: SameListing[];
  /** Different products, clearly labelled as such. */
  similar: Product[];
}

function sameModel(a: Product, b: Product): boolean {
  return (
    !!a.modelNumber &&
    a.modelNumber === b.modelNumber &&
    !!a.brand &&
    a.brand.toLowerCase() === b.brand?.toLowerCase()
  );
}

export function compareFor(selected: Product, results: Product[]): Comparison {
  const sameProduct: SameListing[] = selected.offers
    .slice(1)
    .map((offer) => ({ product: selected, offer, basis: "same_catalog_product" as const }));
  const similar: Product[] = [];

  for (const p of results) {
    if (p.source === selected.source && p.sourceId === selected.sourceId) continue;
    if (sameModel(selected, p)) {
      sameProduct.push(...p.offers.map((offer) => ({ product: p, offer, basis: "same_brand_and_model" as const })));
    } else {
      similar.push(p);
    }
  }
  sameProduct.sort((a, b) => Number(b.offer.available) - Number(a.offer.available) || a.offer.priceCents - b.offer.priceCents);
  return { selected, sameProduct, similar };
}

/** The cheapest available offer for a product, if any. */
export function bestOffer(p: Product): Offer | null {
  return p.offers.find((o) => o.available) ?? null;
}

/**
 * The store the shopper picked, from a fresh look at the product (`shown` may carry invented
 * store names in demo mode; `real` has the real ones, offer for offer). With no pick, the best
 * offer. Null when that store no longer has it, so the caller says so instead of switching stores.
 */
export function offerAt(shown: Product, real: Product, merchant?: string): Offer | null {
  if (!merchant) return bestOffer(shown);
  return shown.offers.find((o, i) => o.available && (o.merchant === merchant || real.offers[i]?.merchant === merchant)) ?? null;
}
