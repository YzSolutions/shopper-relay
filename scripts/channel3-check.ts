// Check the Channel3 key and see what a product search actually returns.
//
//   npm run channel3:check
//   npm run channel3:check -- "winter coat women"
//   npm run channel3:check -- "blood pressure monitor" --raw   # dump the first product as JSON

import { existsSync } from "node:fs";
import { Channel3 } from "@channel3/sdk";
import { formatCents, numberToCents } from "../src/lib/money";
import { categoryFromCatalog } from "../src/lib/policy/category";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const query = args.filter((a) => a !== "--raw").join(" ") || "blood pressure monitor";

async function main() {
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Error("Set CHANNEL3_API_KEY in .env.local.");
  const client = new Channel3({ apiKey });

  const res = (await client.products.search({ query, limit: 5 })).response;
  console.log(`"${query}": ${res.products.length} products\n`);

  if (raw && res.products[0]) {
    console.log(JSON.stringify(res.products[0], null, 2));
    return;
  }

  for (const p of res.products) {
    const path = (p.category?.path ?? []).map((c) => c.title);
    console.log(`- ${p.title}`);
    console.log(`  brand: ${p.brands?.map((b) => b.name).join(", ") || "?"}   id: ${p.id}`);
    console.log(`  category: ${path.join(" > ") || "?"}  ->  counted as ${categoryFromCatalog(path) ?? "(no match, falls back)"}`);
    for (const o of p.offers ?? []) {
      const price = o.price ? formatCents(numberToCents(o.price.price), o.price.currency) : "?";
      console.log(`  offer: ${o.domain}  ${price}  ${o.availability ?? ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err?.message ?? err, err?.body ? JSON.stringify(err.body) : "");
  process.exit(1);
});
