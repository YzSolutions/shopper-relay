// End-to-end run through the real API, Neon, Channel3, Gemini and the PayPal
// sandbox. Where Mom would approve in PayPal's window, this script confirms the
// order with PayPal's sandbox test card instead. SANDBOX ONLY.
//
//   npm run dev                         (in another terminal)
//   npm run e2e                         (BASE_URL defaults to http://localhost:3000)

/* eslint-disable @typescript-eslint/no-explicit-any -- this script reads the API's JSON loosely, like a browser would */
import { existsSync, readFileSync } from "node:fs";
import { configFromEnv, createPayPalClient } from "../src/lib/paypal/client";
import { formatCents } from "../src/lib/money";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.PAYPAL_ENV === "live") throw new Error("e2e runs against the PayPal sandbox only.");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const paypal = createPayPalClient(configFromEnv());
const TEST_CARD = { number: "4111111111111111", expiry: "2030-12", securityCode: "123", name: "Test Buyer" };

async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

const step = (s: string) => console.log(`\n▶ ${s}`);
const expect = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`  ✓ ${msg}`);
};

/** Mom clicks the PayPal button and approves; the app places the hold and decides. */
async function payWithPayPal(purchaseId: string) {
  const { orderId } = await api(`/api/purchases/${purchaseId}/checkout`, { method: "POST" });
  await paypal.confirmWithTestCard(orderId, TEST_CARD);
  return (await api(`/api/purchases/${purchaseId}/approve`, { method: "POST", json: { orderId } })).purchase;
}

async function main() {
  step("Reset the demo household");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Mom" && session.household.reviewerName === "Sarah", "Mom + Sarah household with default rules");
  expect(session.issues.length === 0, "rules have no gaps");

  step("Rule gap is caught before rules can be saved");
  const parsed = await api("/api/rules/parse", { method: "POST", json: { text: "Under $75 I decide. Over $150 Sarah decides.", startFresh: true } });
  expect(parsed.questions.length > 0, `question back to Mom: "${parsed.questions[0]}"`);
  const refused = await fetch(`${BASE}/api/rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: parsed.rules, by: "shopper" }) });
  expect(refused.status === 422, "saving rules with a gap is refused");

  step("Search the catalog");
  const search = await api(`/api/search?q=${encodeURIComponent("blood pressure monitor")}`);
  const cheap = search.results.find((r: any) => r.preview?.outcome === "auto");
  expect(search.results.length > 0, `${search.results.length} results`);
  expect(cheap, `found one Mom can buy herself: ${cheap?.product.title} (${formatCents(cheap?.product.offers[0].priceCents)})`);
  expect(cheap.category.primary === "medical_device", "counted as Medical Devices from the catalog");

  step("Mom buys an item under her limit: PayPal holds, then captures straight away");
  const chosen = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: cheap.product.sourceId } })).purchase;
  expect(chosen.state === "evaluated" && chosen.decision.outcome === "auto", "evaluated as auto");
  const done = await payWithPayPal(chosen.id);
  expect(done.state === "completed" && done.paypal.captureId, `completed, PayPal capture ${done.paypal.captureId}`);

  step("Check Before You Buy: the fictional $149 monitor with a hidden membership");
  const form = new FormData();
  form.append("image", new Blob([readFileSync("public/demo/checkout-membership.png")], { type: "image/png" }), "checkout.png");
  const check = await api("/api/check", { method: "POST", body: form });
  expect(check.recurring === "yes", `recurring charge found: ${formatCents(check.recurringCents)} per ${check.terms.recurring.interval}`);
  expect(check.totalDueTodayCents === 14900, "total due today read as $149.00");

  step("Mom buys it anyway: PayPal holds the money, Sarah is asked");
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  expect(p2.decision.outcome === "review", `goes to Sarah: ${p2.decision.reasons.map((r: any) => r.message).join(" ")}`);
  const held = await payWithPayPal(p2.id);
  expect(held.state === "awaiting_review" && held.reviewPath, `waiting for Sarah at ${held.reviewPath}`);

  step("Sarah opens her link and approves: PayPal captures");
  const review = await api(`/api${held.reviewPath}`);
  expect(review.purchase.id === p2.id, `Sarah sees ${review.purchase.item.title}, ${formatCents(review.purchase.paypalAmountCents)}`);
  const approved = (await api(`/api${held.reviewPath}`, { method: "POST", json: { decision: "approve" } })).purchase;
  expect(approved.state === "completed" && approved.paypal.captureId, "captured after Sarah approved");
  const reused = await fetch(`${BASE}/api${held.reviewPath}`);
  expect(reused.status === 404, "the review link stops working once used");

  step("Another one Sarah declines: the hold is voided");
  const p3 = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  const held3 = await payWithPayPal(p3.id);
  const declined = (await api(`/api${held3.reviewPath}`, { method: "POST", json: { decision: "decline" } })).purchase;
  expect(declined.state === "declined", "declined");
  const auth3 = await paypal.getAuthorization(declined.paypal.authorizationId);
  expect(auth3.status === "VOIDED", "PayPal shows the authorization VOIDED");

  step("Sarah never answers: after 24 hours the hold is released");
  const p4 = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  const held4 = await payWithPayPal(p4.id);
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const expired = (await api(`/api/purchases/${held4.id}`)).purchase;
  expect(expired.state === "expired", "expired");
  expect((await paypal.getAuthorization(expired.paypal.authorizationId)).status === "VOIDED", "PayPal shows it VOIDED");

  step("Mom loosens a safeguard: Sarah is notified, 24h cooling-off");
  const rules = session.rules;
  const looser = { ...rules, categories: { ...rules.categories, medical_device: { bands: [{ minCents: 0, maxCents: 50000, outcome: "auto" }, { minCents: 50000, maxCents: null, outcome: "review" }] } } };
  const change = await api("/api/rules", { method: "POST", json: { rules: looser, by: "shopper" } });
  expect(change.notify === "reviewer" && change.state.pending, change.message);
  const blocked = await fetch(`${BASE}/api/rules/pending`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "drop", by: "reviewer" }) });
  expect(blocked.status === 403, "Sarah can't cancel Mom's change");
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const after = await api("/api/session");
  expect(!after.pending && after.rules.categories.medical_device.bands[0].maxCents === 50000, "after 24 hours the change applies by itself");

  step("Why log");
  const log = await api("/api/log");
  expect(log.events.length > 10, `${log.events.length} entries`);
  for (const e of log.events.slice(0, 6).reverse()) console.log(`    [${e.actor}] ${e.message}`);

  console.log("\nAll end-to-end checks passed.");
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}`);
  process.exit(1);
});
