// Long, chatty searches ("a camera for my trip that fits in my purse") pull in
// whatever the extra words match, like handbags. Before searching, a long one
// is boiled down to the product and the details that matter, and a price limit
// the person stated is applied as a filter. Short searches go to the store as typed.

import { z } from "zod";
import { generateJson } from "./gemini";

export interface SearchTerms {
  /** What to send to the catalog. */
  query: string;
  /** A price limit the person stated ("under $200"), in cents. */
  maxPriceCents: number | null;
}

const PRICE_LIMIT = /\b(under|below|less than|no more than|max(?:imum)?|up to|at most|cheaper than)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd)?/i;
// "Under $40" leaves $40 itself out, as the rules do; "up to $40" keeps it.
const STRICT = /^(under|below|less than|cheaper than)$/i;

/** A price limit written in the search, read by code, not the AI. */
export function priceLimit(text: string): number | null {
  const m = PRICE_LIMIT.exec(text);
  if (!m) return null;
  const cents = Math.round(Number(m[2]) * 100) - (STRICT.test(m[1]) ? 1 : 0);
  return cents > 0 ? cents : null;
}

/** Short enough to send as typed. */
export function isPlainSearch(text: string): boolean {
  return text.trim().split(/\s+/).length <= 5 && priceLimit(text) === null;
}

const TermsSchema = z.object({
  query: z.string().describe("the product to search a store for, with only the details that change which product fits: 2 to 7 words, e.g. \"compact zoom travel camera\""),
});

export async function searchTerms(text: string): Promise<SearchTerms> {
  const q = text.trim();
  if (isPlainSearch(q)) return { query: q, maxPriceCents: null };
  const maxPriceCents = priceLimit(q);
  try {
    const { data } = await generateJson({
      task: "search-terms-v1",
      speed: "quick",
      schema: TermsSchema,
      system: `Someone typed a shopping search in their own words. Write the short search a store's search box needs to find the product they want.
- Keep the kind of product and the details that matter for choosing it (size, use, features, who it's for when that changes the product, like "kids").
- Drop prices, budgets, who it's for when that doesn't change the product, stories, and things only mentioned in passing. "Small enough to fit in my purse" means "compact", not a purse.
- Never add a brand or detail they didn't say.`,
      parts: [{ text: q }],
    });
    const query = data.query.trim().replace(/\s+/g, " ").slice(0, 120);
    return { query: query.length >= 2 ? query : q, maxPriceCents };
  } catch {
    // Searching as typed is still better than no results.
    return { query: q, maxPriceCents };
  }
}
