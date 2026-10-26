import { z } from "zod";
import { explainResults } from "@/lib/ai/products";
import { body, handle } from "@/lib/http";

// Only what the explanation uses. Store listings vary a lot (some list dozens of
// features), so long lists are trimmed rather than rejected.
const trimmed = <T extends z.ZodType>(item: T, keep: number) => z.array(item).max(100).transform((a) => a.slice(0, keep));
const ProductFacts = z.object({
  sourceId: z.string().max(64),
  title: z.string().max(1000),
  brand: z.string().max(200).nullable(),
  categoryPath: trimmed(z.string().max(200), 8),
  keyFeatures: trimmed(z.string().max(2000), 5),
  offers: trimmed(
    z.object({
      merchant: z.string().max(200),
      priceCents: z.number().int().nonnegative(),
      currency: z.string().max(3),
      available: z.boolean(),
    }),
    3,
  ),
});

/** Plain-language summary of search results. Explanations only; nothing here affects a decision. */
export async function POST(req: Request) {
  return handle(async () => {
    const { query, products } = await body(req, z.object({ query: z.string().min(1).max(200), products: z.array(ProductFacts).min(1).max(12) }));
    return explainResults(query, products);
  });
}
