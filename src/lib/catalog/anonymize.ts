import type { Product } from "./types";

// Demo mode for the video: the hackathon rules don't allow third-party
// trademarks on screen, so real store and brand names are swapped for
// invented ones and product photos (which show logos) are blurred. The same
// store always gets the same invented name, so comparisons still make sense.

const FIRST = ["Northfield", "Maple Row", "Harborline", "Cedar Lane", "Riverbend", "Summit Hill", "Willowby", "Graniteway", "Lakeshore", "Brightwater", "Oakmont", "Meadowview"];
const SECOND = ["Market", "Goods", "Supply", "Outlet", "Mercantile", "General Store", "Emporium", "Depot", "Trading Co.", "Shop", "Provisions", "Bazaar"];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** An invented, stable store name for a retailer domain. */
export function storeAlias(domain: string): string {
  const h = hash(domain);
  return `${FIRST[h % FIRST.length]} ${SECOND[Math.floor(h / FIRST.length) % SECOND.length]}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove the brand name and trademark symbols from a product title. */
export function stripBrand(title: string, brand: string | null): string {
  let t = title.replace(/[®™©]/g, "");
  if (brand) t = t.replace(new RegExp(`\\b${escapeRegExp(brand)}\\b`, "gi"), "");
  t = t.replace(/\s{2,}/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : title;
}

export function anonymizeProduct(p: Product): Product & { imageHidden: true } {
  return {
    ...p,
    title: stripBrand(p.title, p.brand),
    brand: null,
    description: p.description && p.brand ? p.description.replace(new RegExp(`\\b${escapeRegExp(p.brand)}\\b`, "gi"), "the maker") : p.description,
    keyFeatures: p.brand ? p.keyFeatures.map((f) => f.replace(new RegExp(`\\b${escapeRegExp(p.brand!)}\\b`, "gi"), "the maker")) : p.keyFeatures,
    offers: p.offers.map((o) => ({ ...o, merchant: storeAlias(o.merchant), url: "" })),
    imageHidden: true,
  };
}
