// Plain-language help with product results, and a category guess for the
// rare product the catalog doesn't categorize. The AI explains facts it is
// given; it never adds claims of its own.

import { z } from "zod";
import type { Product } from "../catalog/types";
import { formatCents } from "../money";
import { CATEGORY_IDS, CATEGORY_LABELS, type CategoryId } from "../policy";
import { generateJson } from "./gemini";

const GUARDRAILS = `- Use only the facts provided. If something isn't in the facts, don't mention it.
- Say "listed" or "the seller says" for features; you haven't verified them.
- Never say products are equivalent, or that one is more accurate, safer, healthier or medically better than another.
- No medical, legal or financial advice.
- Write for someone who may be an older adult and isn't technical: everyday words, very short sentences.
- No jargon or spec-speak. Never write GB, TB, RAM, SSD, CPU, GPU, "solid state", "processor", Hz, mAh or model codes. Say what it means for the person instead: "lots of room for photos and games", "fast", "battery lasts all day".
- Round prices ("about $40").
- Don't state a price range or the lowest or highest price: the app works that out from every result and shows it separately.`;

/** The few product facts the AI is shown. */
export type ProductFacts = Pick<Product, "sourceId" | "title" | "brand" | "categoryPath" | "keyFeatures"> & {
  offers: Array<Pick<Product["offers"][number], "merchant" | "priceCents" | "currency" | "available">>;
};

function factsOf(p: ProductFacts) {
  return {
    id: p.sourceId,
    title: p.title,
    brand: p.brand,
    category: p.categoryPath.join(" > ") || null,
    prices: p.offers.slice(0, 3).map((o) => `${formatCents(o.priceCents, o.currency)} at ${o.merchant}${o.available ? "" : " (out of stock)"}`),
    listedFeatures: p.keyFeatures.slice(0, 5),
  };
}

const ExplainSchema = z.object({
  summary: z.string().describe("one short sentence, at most 15 words, that sums up the choices"),
  points: z
    .array(z.string().describe("one short, simple point, at most 12 words"))
    .min(2)
    .max(4)
    .describe("the few things worth knowing when choosing: features and what's included. Never prices or dollar amounts; the app shows prices itself"),
  notes: z.array(z.object({ id: z.string(), note: z.string().describe("one short, simple sentence about this product, at most 15 words") })),
});

// Fast models sometimes state a price range anyway, and get it wrong. The app shows the
// real range from every result, so any point about prices is dropped.
const PRICE_TALK = /\$\s?\d|\b(price|prices|priced|cost|costs|dollars?)\b/i;
export const withoutPriceTalk = (points: string[]) => points.filter((p) => !PRICE_TALK.test(p));

export async function explainResults(query: string, products: ProductFacts[]) {
  const { data, model } = await generateJson({
    task: "explain-results-v5",
    speed: "quick",
    schema: ExplainSchema,
    system: `You help someone understand shopping results in plain language.\n${GUARDRAILS}`,
    parts: [{ text: JSON.stringify({ searchedFor: query, products: products.slice(0, 12).map(factsOf) }) }],
  });
  const known = new Set(products.map((p) => p.sourceId));
  return { summary: data.summary, points: withoutPriceTalk(data.points), notes: data.notes.filter((n) => known.has(n.id)), model };
}

const ClassifySchema = z.object({
  category: z.enum(CATEGORY_IDS),
  confidence: z.number().min(0).max(1),
});

/** Only used when the catalog's own category doesn't map; resolveCategory() decides how much to trust it. */
export async function classifyProduct(p: Product): Promise<{ category: CategoryId; confidence: number }> {
  const categories = CATEGORY_IDS.filter((c) => c !== "subscription").map((id) => `${id}: ${CATEGORY_LABELS[id]}`).join("\n");
  const { data } = await generateJson({
    task: "classify-product",
    speed: "quick",
    schema: ClassifySchema,
    system: `Pick the spending category that best fits a product. If none fits well, use "general" with low confidence.\n${categories}`,
    parts: [{ text: JSON.stringify(factsOf(p)) }],
  });
  return data.category === "subscription" ? { category: "general", confidence: 0 } : data;
}
