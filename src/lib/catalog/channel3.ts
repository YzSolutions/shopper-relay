import { Channel3, type Channel3Api } from "@channel3/sdk";
import { numberToCents } from "../money";
import type { Offer, Product, ProductSource } from "./types";

/** Model numbers are only trusted from an explicit attribute or a parenthesised code in the title. */
const MODEL_ATTRIBUTE_KEYS = ["model", "model-number", "model_number", "mpn"];
const TITLE_MODEL = /\(([A-Z0-9][A-Z0-9-]{3,})\)/;

export function modelNumberOf(p: Pick<Channel3Api.Product, "title" | "structured_attributes">): string | null {
  for (const key of MODEL_ATTRIBUTE_KEYS) {
    const value = p.structured_attributes?.[key]?.[0];
    if (value) return value.trim().toUpperCase();
  }
  return TITLE_MODEL.exec(p.title)?.[1] ?? null;
}

function toOffer(o: Channel3Api.ProductOffer): Offer {
  return {
    merchant: o.domain,
    url: o.url,
    priceCents: numberToCents(o.price.price),
    compareAtCents: o.price.compare_at_price == null ? null : numberToCents(o.price.compare_at_price),
    currency: o.price.currency,
    available: o.availability === "InStock",
    condition: o.condition ?? null,
  };
}

export function normalizeChannel3(p: Channel3Api.Product): Product {
  const images = p.images ?? [];
  const main = images.find((i) => i.is_main_image) ?? images[0];
  const offers = (p.offers ?? [])
    .map(toOffer)
    .sort((a, b) => Number(b.available) - Number(a.available) || a.priceCents - b.priceCents);
  return {
    source: "channel3",
    sourceId: p.id,
    title: p.title,
    brand: p.brands?.[0]?.name ?? null,
    modelNumber: modelNumberOf(p),
    description: p.description ?? null,
    imageUrl: main?.url ?? null,
    categoryPath: (p.category?.path ?? []).map((c) => c.title),
    keyFeatures: p.key_features ?? [],
    attributes: p.structured_attributes ?? {},
    offers,
  };
}

export function createChannel3Source(apiKey = process.env.CHANNEL3_API_KEY): ProductSource {
  if (!apiKey) throw new Error("CHANNEL3_API_KEY is not set.");
  const client = new Channel3({ apiKey });
  return {
    name: "channel3",
    async search(query, { limit = 12, maxPriceCents } = {}) {
      const page = await client.products.search({
        query,
        limit: Math.min(limit, 30),
        filters: maxPriceCents ? { price: { max_price: maxPriceCents / 100 } } : undefined,
      });
      return page.response.products.map(normalizeChannel3).filter((p) => p.offers.length > 0);
    },
    async get(sourceId) {
      try {
        return normalizeChannel3(await client.products.retrieve({ product_id: sourceId }));
      } catch {
        return null;
      }
    },
  };
}
