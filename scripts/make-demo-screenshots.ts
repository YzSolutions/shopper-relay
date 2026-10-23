// Render the fictional checkout pages used for "Check Before You Buy".
// Every product, store and price here is invented.
//
//   npx tsx scripts/make-demo-screenshots.ts

import { mkdirSync } from "node:fs";
import sharp from "sharp";

const W = 900;
const H = 1100;

function page({ smallPrint, total }: { smallPrint: string[]; total: string }) {
  const lines = smallPrint
    .map((l, i) => `<text x="60" y="${905 + i * 22}" font-size="15" fill="#8a8f98">${l}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="80" fill="#24335c"/>
  <text x="60" y="52" font-size="28" font-weight="700" fill="#ffffff">Corvane Health Shop</text>
  <text x="${W - 60}" y="52" font-size="18" fill="#c9d3ee" text-anchor="end">Secure checkout</text>

  <text x="60" y="150" font-size="30" font-weight="700" fill="#1c1f26">Review your order</text>

  <rect x="60" y="185" width="140" height="140" rx="12" fill="#eef1f6"/>
  <circle cx="130" cy="255" r="42" fill="none" stroke="#9aa6bf" stroke-width="8"/>
  <text x="230" y="225" font-size="22" font-weight="600" fill="#1c1f26">Pulsewise Arm Monitor P200</text>
  <text x="230" y="258" font-size="17" fill="#555b66">Upper arm blood pressure monitor · Qty 1</text>
  <text x="230" y="290" font-size="17" fill="#555b66">Includes Pulsewise Plus app access</text>
  <text x="${W - 60}" y="225" font-size="22" font-weight="600" fill="#1c1f26" text-anchor="end">$149.00</text>

  <line x1="60" y1="370" x2="${W - 60}" y2="370" stroke="#e3e6ec"/>
  <text x="60" y="415" font-size="19" fill="#3a3f4a">Subtotal</text><text x="${W - 60}" y="415" font-size="19" fill="#3a3f4a" text-anchor="end">$149.00</text>
  <text x="60" y="455" font-size="19" fill="#3a3f4a">Shipping</text><text x="${W - 60}" y="455" font-size="19" fill="#3a3f4a" text-anchor="end">FREE</text>
  <text x="60" y="495" font-size="19" fill="#3a3f4a">Estimated tax</text><text x="${W - 60}" y="495" font-size="19" fill="#3a3f4a" text-anchor="end">$0.00</text>
  <line x1="60" y1="525" x2="${W - 60}" y2="525" stroke="#e3e6ec"/>
  <text x="60" y="575" font-size="24" font-weight="700" fill="#1c1f26">Total due today</text>
  <text x="${W - 60}" y="575" font-size="24" font-weight="700" fill="#1c1f26" text-anchor="end">${total}</text>

  <rect x="60" y="640" width="${W - 120}" height="72" rx="10" fill="#f2b33d"/>
  <text x="${W / 2}" y="686" font-size="22" font-weight="700" fill="#1c1f26" text-anchor="middle">Place order</text>
  <text x="${W / 2}" y="760" font-size="16" fill="#555b66" text-anchor="middle">Free returns within 30 days of delivery.</text>

  <line x1="60" y1="860" x2="${W - 60}" y2="860" stroke="#eef0f4"/>
  ${lines}
</svg>`;
}

async function main() {
  mkdirSync("public/demo", { recursive: true });
  const withMembership = page({
    total: "$149.00",
    smallPrint: [
      "By placing your order you agree to our Terms of Sale. Your purchase includes a 30-day free trial of",
      "Pulsewise Plus. After the trial, Pulsewise Plus renews automatically at $39.00/month and is billed to",
      "your payment method until you cancel. Cancel anytime in your account settings before the trial ends",
      "to avoid charges. Membership fees are non-refundable.",
    ],
  });
  const oneTime = page({
    total: "$149.00",
    smallPrint: ["By placing your order you agree to our Terms of Sale.", "This is a one-time purchase."],
  });
  await sharp(Buffer.from(withMembership)).png().toFile("public/demo/checkout-membership.png");
  await sharp(Buffer.from(oneTime.replace("Includes Pulsewise Plus app access", "Batteries included"))).png().toFile("public/demo/checkout-one-time.png");
  console.log("Wrote public/demo/checkout-membership.png and public/demo/checkout-one-time.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
