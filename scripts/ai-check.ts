// Run each AI job once against real inputs.
//
//   npm run ai:check

import { existsSync, readFileSync } from "node:fs";
import { parseRules } from "../src/lib/ai/rules";
import { readCheckoutScreenshot } from "../src/lib/ai/terms";
import { classifyProduct, explainResults } from "../src/lib/ai/products";
import { createChannel3Source } from "../src/lib/catalog/channel3";
import { formatCents } from "../src/lib/money";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const names = { shopper: "Mom", reviewer: "Sarah" };
const png = (path: string) => ({ base64: readFileSync(path).toString("base64"), mimeType: "image/png" });

async function main() {
  console.log("== Rules with a gap");
  const gap = await parseRules("Under $75 I decide myself. Over $150 my daughter Sarah decides.", names);
  console.log(gap.summary);
  console.log("questions:", gap.questions);

  console.log("\n== Mom's full rules");
  const full = await parseRules(
    "I can buy groceries under $100, clothes under $80 and medical devices under $100 on my own. " +
      "Doctor visits under $150 are fine. Anything else under $75. Above those, Sarah takes a look. Any subscription goes to Sarah.",
    names,
  );
  console.log(full.summary);
  for (const [cat, rule] of Object.entries(full.rules.categories)) {
    console.log(`  ${cat}: ${rule!.bands.map((b) => `${formatCents(b.minCents)}-${b.maxCents === null ? "∞" : formatCents(b.maxCents)} ${b.outcome}`).join(", ")}`);
  }
  console.log("questions:", full.questions, "unclear:", full.unclear, "model:", full.model);

  for (const file of ["public/demo/checkout-membership.png", "public/demo/checkout-one-time.png"]) {
    console.log(`\n== ${file}`);
    const t = await readCheckoutScreenshot(png(file));
    console.log(`recurring: ${t.recurring}  today: ${t.totalDueTodayCents === null ? "?" : formatCents(t.totalDueTodayCents)}  recurring: ${t.recurringCents === null ? "-" : formatCents(t.recurringCents)} per ${t.raw.recurring.interval ?? "-"}`);
    console.log("evidence:", t.raw.recurring.evidence);
    console.log(t.raw.plainSummary);
  }

  console.log("\n== Explain search results");
  const products = await createChannel3Source().search("blood pressure monitor", { limit: 5 });
  const ex = await explainResults("blood pressure monitor", products);
  console.log(ex.summary);
  for (const n of ex.notes) console.log(`  - ${n.note}`);

  console.log("\n== Classify (fallback only)");
  if (products[0]) console.log(products[0].title, "->", await classifyProduct(products[0]));
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
