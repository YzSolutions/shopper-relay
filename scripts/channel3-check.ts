// Check the Channel3 key and see what search returns, through the same adapter the app uses.
//
//   npm run channel3:check
//   npm run channel3:check -- "winter coat women"

import { existsSync } from "node:fs";
import { createChannel3Source } from "../src/lib/catalog/channel3";
import { compareFor } from "../src/lib/catalog/compare";
import { formatCents } from "../src/lib/money";
import { resolveCategory } from "../src/lib/policy/category";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const query = process.argv.slice(2).join(" ") || "blood pressure monitor";

async function main() {
  const products = await createChannel3Source().search(query, { limit: 8 });
  console.log(`"${query}": ${products.length} products\n`);

  for (const p of products) {
    const counted = resolveCategory({ catalogPath: p.categoryPath, recurring: "no" });
    console.log(`- ${p.title}`);
    console.log(`  brand: ${p.brand ?? "?"}   model: ${p.modelNumber ?? "-"}   id: ${p.sourceId}`);
    console.log(`  category: ${p.categoryPath.join(" > ") || "?"}  ->  counted as ${counted.primary} (${counted.basis})`);
    for (const o of p.offers) console.log(`  offer: ${o.merchant}  ${formatCents(o.priceCents, o.currency)}${o.available ? "" : "  (out of stock)"}`);
  }

  if (products[0]) {
    const c = compareFor(products[0], products);
    console.log(`\nCompared with "${products[0].title}": ${c.sameProduct.length} same-product listings, ${c.similar.length} similar products.`);
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
