import { z } from "zod";
import { explainResults } from "@/lib/ai/products";
import { body, handle } from "@/lib/http";

const ProductFacts = z.object({
  source: z.literal("channel3"),
  sourceId: z.string().max(64),
  title: z.string().max(300),
  brand: z.string().max(100).nullable(),
  modelNumber: z.string().max(64).nullable(),
  description: z.string().max(2000).nullable(),
  imageUrl: z.string().max(1000).nullable(),
  categoryPath: z.array(z.string().max(100)).max(8),
  keyFeatures: z.array(z.string().max(300)).max(10),
  attributes: z.record(z.string(), z.array(z.string())),
  offers: z
    .array(
      z.object({
        merchant: z.string().max(100),
        url: z.string().max(1000),
        priceCents: z.number().int().nonnegative(),
        compareAtCents: z.number().int().nullable(),
        currency: z.string().max(3),
        available: z.boolean(),
        condition: z.string().nullable(),
      }),
    )
    .max(10),
});

/** Plain-language summary of search results. Explanations only; nothing here affects a decision. */
export async function POST(req: Request) {
  return handle(async () => {
    const { query, products } = await body(req, z.object({ query: z.string().min(1).max(200), products: z.array(ProductFacts).min(1).max(8) }));
    return explainResults(query, products);
  });
}
