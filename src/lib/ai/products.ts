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
- Short sentences and everyday words, for someone who may be an older adult.`;

function factsOf(p: Product) {
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
  summary: z.string().describe("two or three sentences comparing the options, mostly on price and listed features"),
  notes: z.array(z.object({ id: z.string(), note: z.string().describe("one short sentence about this product") })),
});

export async function explainResults(query: string, products: Product[]) {
  const { data, model } = await generateJson({
    task: "explain-results",
    schema: ExplainSchema,
    system: `You help someone understand shopping results in plain language.\n${GUARDRAILS}`,
    parts: [{ text: JSON.stringify({ searchedFor: query, products: products.slice(0, 8).map(factsOf) }) }],
  });
  const known = new Set(products.map((p) => p.sourceId));
  return { summary: data.summary, notes: data.notes.filter((n) => known.has(n.id)), model };
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
    schema: ClassifySchema,
    system: `Pick the spending category that best fits a product. If none fits well, use "general" with low confidence.\n${categories}`,
    parts: [{ text: JSON.stringify(factsOf(p)) }],
  });
  return data.category === "subscription" ? { category: "general", confidence: 0 } : data;
}
