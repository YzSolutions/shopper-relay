// Day-1 check that PayPal sandbox does what the product depends on:
// create an AUTHORIZE order -> buyer approves -> authorize (hold) ->
// read the held amount back and compare -> capture, or void with --void.
//
//   npm run paypal:check            # authorize then capture
//   npm run paypal:check -- --void  # authorize then void
//
// Needs PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env.local and a sandbox
// *personal* (buyer) account to log in with when the approval link opens.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { approvalLink, configFromEnv, createPayPalClient, firstAuthorization, PayPalError } from "../src/lib/paypal/client";
import { checkPayPalAmount } from "../src/lib/policy/amount";
import { formatCents } from "../src/lib/money";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const shouldVoid = process.argv.includes("--void");
const AMOUNT_CENTS = 14900; // what the owner "reviewed" in this test
const runId = randomUUID();

async function main() {
  const paypal = createPayPalClient(configFromEnv());

  const order = await paypal.createAuthorizeOrder({
    amountCents: AMOUNT_CENTS,
    description: "Sandbox check: blood pressure monitor (fictional)",
    customId: `check-${runId}`,
    returnUrl: "https://example.com/paypal-return",
    cancelUrl: "https://example.com/paypal-cancel",
    requestId: `create-${runId}`,
  });
  console.log(`1. Order ${order.id} created, status ${order.status}.`);

  const link = approvalLink(order);
  if (!link) throw new Error("PayPal returned no approval link.");
  console.log(`\n2. Open this link, log in with your sandbox BUYER account and approve:\n\n   ${link}\n`);
  console.log("   After approving you'll land on example.com. That's expected; come back here.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("   Press Enter once you've approved... ");
  rl.close();

  const authorized = await paypal.authorizeOrder(order.id, `authorize-${runId}`);
  const auth = firstAuthorization(authorized);
  if (!auth) throw new Error(`No authorization on order (status ${authorized.status}).`);
  console.log(`3. Authorization ${auth.id}: ${auth.status}, holding ${auth.amount.value} ${auth.amount.currency_code}, expires ${auth.expiration_time ?? "?"}.`);

  const readBack = await paypal.getAuthorization(auth.id);
  const check = checkPayPalAmount(AMOUNT_CENTS, readBack.amount);
  console.log(
    check.ok
      ? `4. Read back from PayPal: ${formatCents(check.paypalCents)}, matches what was reviewed.`
      : `4. AMOUNT MISMATCH: ${check.message}`,
  );
  // The app's mismatch path, shown against a figure the AI might have misread:
  const misread = checkPayPalAmount(12900, readBack.amount);
  if (!misread.ok) console.log(`   (If the AI had read $129.00, the app would stop: "${misread.message}")`);

  if (shouldVoid) {
    await paypal.voidAuthorization(auth.id, `void-${runId}`);
    const after = await paypal.getAuthorization(auth.id);
    console.log(`5. Voided. Authorization is now ${after.status}; nothing was charged.`);
  } else {
    const capture = await paypal.captureAuthorization(auth.id, `capture-${runId}`);
    console.log(`5. Captured ${capture.amount.value} ${capture.amount.currency_code}, capture ${capture.id}: ${capture.status}.`);
    const after = await paypal.getAuthorization(auth.id);
    console.log(`   Authorization is now ${after.status}.`);
  }
}

main().catch((err) => {
  if (err instanceof PayPalError) console.error(err.message, JSON.stringify(err.body, null, 2));
  else console.error(err);
  process.exit(1);
});
