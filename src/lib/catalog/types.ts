// Products as the rest of the app sees them, whatever source they came from.
// Adding a second source means writing another adapter that returns these.

export interface Offer {
  /** Retailer domain, e.g. "staples.com". */
  merchant: string;
  /** Where the item can be bought (a tracked affiliate link for Channel3). */
  url: string;
  priceCents: number;
  /** The "was" price, when the retailer lists one. */
  compareAtCents: number | null;
  currency: string;
  available: boolean;
  condition: string | null;
}

export interface Product {
  source: "channel3";
  sourceId: string;
  title: string;
  brand: string | null;
  /** Only when we can read one reliably; used for "same product" matches across listings. */
  modelNumber: string | null;
  description: string | null;
  imageUrl: string | null;
  /** The source's own taxonomy, broadest first. */
  categoryPath: string[];
  keyFeatures: string[];
  attributes: Record<string, string[]>;
  /** Cheapest available first. */
  offers: Offer[];
}

export interface SearchOptions {
  limit?: number;
  maxPriceCents?: number;
}

export interface ProductSource {
  name: Product["source"];
  search(query: string, options?: SearchOptions): Promise<Product[]>;
  /** Fresh price and stock for one product, used right before checkout. */
  get(sourceId: string): Promise<Product | null>;
}
