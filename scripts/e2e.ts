// End-to-end run through the real API, Neon, Channel3, Gemini and the PayPal
// sandbox, for all three relationships. Wherever a person would approve in
// PayPal's window, this script confirms the order with PayPal's sandbox test
// card instead. SANDBOX ONLY.
//
//   npm run dev                         (in another terminal)
//   npm run e2e                         (BASE_URL defaults to http://localhost:3000)
//   npm run e2e -- kids                 (just one: mom | kids | shopper)

/* eslint-disable @typescript-eslint/no-explicit-any -- this script reads the API's JSON loosely, like a browser would */
import { existsSync, readFileSync } from "node:fs";
import { configFromEnv, createPayPalClient } from "../src/lib/paypal/client";
import { formatCents } from "../src/lib/money";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.PAYPAL_ENV === "live") throw new Error("e2e runs against the PayPal sandbox only.");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const paypal = createPayPalClient(configFromEnv());
const TEST_CARD = { number: "4111111111111111", expiry: "2030-12", securityCode: "123", name: "Test Buyer" };
let mode = "family_elder";

async function raw(path: string, init?: RequestInit & { json?: unknown }) {
  const headers: Record<string, string> = { Cookie: `sr_mode=${mode}` };
  if (init?.json !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${BASE}${path}`, { ...init, headers, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
}

async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await raw(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

const step = (s: string) => console.log(`\n▶ ${s}`);
const expect = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`  ✓ ${msg}`);
};

/** The shopper clicks the PayPal button and approves (Mom's flow). */
async function shopperPays(purchaseId: string) {
  const { orderId } = await api(`/api/purchases/${purchaseId}/checkout`, { method: "POST" });
  await paypal.confirmWithTestCard(orderId, TEST_CARD);
  return (await api(`/api/purchases/${purchaseId}/approve`, { method: "POST", json: { orderId } })).purchase;
}

/** The reviewer approves in PayPal from their link: pay now, or a one-time authorization. */
async function reviewerPays(reviewPath: string, body: unknown = { kind: "pay" }) {
  const { orderId } = await api(`/api${reviewPath}/pay`, { method: "POST", json: body });
  await paypal.confirmWithTestCard(orderId, TEST_CARD);
  return (await api(`/api${reviewPath}/paid`, { method: "POST", json: { orderId } })).purchase;
}

async function search(q: string) {
  return (await api(`/api/search?q=${encodeURIComponent(q)}`)).results as any[];
}

function checkoutScreenshot() {
  const form = new FormData();
  form.append("image", new Blob([readFileSync("public/demo/checkout-membership.png")], { type: "image/png" }), "checkout.png");
  return api("/api/check", { method: "POST", body: form });
}

async function mom() {
  mode = "family_elder";
  step("Mom + Sarah: reset");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Mom" && session.household.reviewerName === "Sarah", "Mom + Sarah household with default rules");

  step("A rule gap is caught before rules can be saved");
  const parsed = await api("/api/rules/parse", { method: "POST", json: { text: "Under $75 I decide. Over $150 Sarah decides.", startFresh: true } });
  expect(parsed.questions.length > 0, `question back to Mom: "${parsed.questions[0]}"`);
  const refused = await raw("/api/rules", { method: "POST", json: { rules: parsed.rules, by: "shopper" } });
  expect(refused.status === 422, "saving rules with a gap is refused");

  step("A custom category from plain English");
  const cars = await api("/api/rules/parse", { method: "POST", json: { text: "I can buy cars under 10000, but over that needs Sarah" } });
  expect(cars.rules.categories["custom:Cars"], `"Cars" became its own category (counts: ${cars.rules.custom?.["custom:Cars"]?.match.join(", ")})`);

  step("Mom buys under her limit: PayPal holds, then captures straight away");
  const cheap = (await search("blood pressure monitor")).find((r) => r.preview?.outcome === "auto");
  expect(cheap?.category.primary === "medical_device", `${cheap?.product.title} (${formatCents(cheap?.product.offers[0].priceCents)}) counted as Medical Devices`);
  const chosen = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: cheap.product.sourceId } })).purchase;
  const done = await shopperPays(chosen.id);
  expect(done.state === "completed" && done.paypal.captureId, `completed, PayPal capture ${done.paypal.captureId}`);

  step("Check Before You Buy, then Sarah approves the $149 monitor");
  const check = await checkoutScreenshot();
  expect(check.recurring === "yes" && check.totalDueTodayCents === 14900, `$149 today and a recurring ${formatCents(check.recurringCents)} per ${check.terms.recurring.interval}`);
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  const held = await shopperPays(p2.id);
  expect(held.state === "awaiting_review" && held.reviewerName === "Sarah", `held, waiting for ${held.reviewerName}`);
  const approved = (await api(`/api${held.reviewPath}`, { method: "POST", json: { decision: "approve" } })).purchase;
  expect(approved.state === "completed" && approved.paypal.captureId, "captured after Sarah approved");
  expect((await raw(`/api${held.reviewPath}`)).status === 404, "the review link stops working once used");

  step("Sarah declines one; another expires after 24 hours");
  const p3 = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase.id);
  const declined = (await api(`/api${p3.reviewPath}`, { method: "POST", json: { decision: "decline" } })).purchase;
  expect(declined.state === "declined" && (await paypal.getAuthorization(declined.paypal.authorizationId)).status === "VOIDED", "declined, and PayPal shows VOIDED");
  const p4 = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase.id);
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const expired = (await api(`/api/purchases/${p4.id}`)).purchase;
  expect(expired.state === "expired" && (await paypal.getAuthorization(expired.paypal.authorizationId)).status === "VOIDED", "expired, and PayPal shows VOIDED");

  step("Video games go to Tom: a reviewer change waits 24 hours, then Tom is asked");
  const rules = (await api("/api/session")).rules;
  const withTom = { ...rules, categories: { ...rules.categories, video_games: { ...rules.categories.general, reviewer: "Tom" } } };
  const change = await api("/api/rules", { method: "POST", json: { rules: withTom, by: "shopper" } });
  expect(change.notify === "reviewer" && change.state.pending, "treated as loosening: Sarah is told and it waits");
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const s2 = await api("/api/session");
  expect(!s2.pending && s2.reviewers.includes("Tom"), "after 24 hours, Tom reviews video games");
  const game = (await search("video game controller")).find((r) => r.category.primary === "video_games" && r.preview?.outcome === "review");
  if (game) {
    const g = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: game.product.sourceId } })).purchase.id);
    expect(g.state === "awaiting_review" && g.reviewerName === "Tom", `${game.product.title}: waiting for Tom, not Sarah`);
    await api(`/api${g.reviewPath}`, { method: "POST", json: { decision: "decline" } });
  } else {
    console.log("  (no video game over $75 in today's catalog; skipped the purchase check)");
  }
}

async function kids() {
  mode = "parent_child";
  step("Kids + parent: reset");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Leo" && session.relationship.flow === "request", "Leo asks, Dana approves and pays");
  expect(session.budget.length === 2, `budgets: ${session.budget.map((b: any) => `${formatCents(b.limitCents)} a ${b.period}`).join(", ")}`);

  step("Leo asks for something; Dana approves and pays");
  const results = await search("kids book");
  const pick = results.find((r) => r.product.offers[0]?.priceCents <= 3000) ?? results[0];
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  expect(p.state === "evaluated" && p.flow === "request", `${pick.product.title} (${formatCents(p.reviewedCents)}): ${p.decision.outcome}`);
  const sent = (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  expect(sent.state === "requested" && sent.reviewPath, "request sent to Dana; nothing paid yet");
  const reserved = (await api("/api/session")).budget[0];
  expect(reserved.reservedCents === p.reviewedCents, `${formatCents(reserved.reservedCents)} set aside in this week's budget while it waits`);
  const paid = await reviewerPays(sent.reviewPath);
  expect(paid.state === "completed" && paid.paypal.captureId, `Dana paid: PayPal capture ${paid.paypal.captureId}`);
  const after = (await api("/api/session")).budget[0];
  expect(after.spentCents === p.reviewedCents && after.reservedCents === 0, "it now counts as spent, not reserved");

  step("Dana says no to the next one: nothing paid, budget released");
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const sent2 = (await api(`/api/purchases/${p2.id}/request`, { method: "POST" })).purchase;
  const no = (await api(`/api${sent2.reviewPath}`, { method: "POST", json: { decision: "decline" } })).purchase;
  expect(no.state === "declined" && !no.paypal.authorizationId, "declined; PayPal never involved");
  expect((await api("/api/session")).budget[0].reservedCents === 0, "the reserved amount is released");

  step("A subscription is blocked for kids");
  const check = await checkoutScreenshot();
  const sub = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  expect(sub.state === "blocked", "blocked: subscriptions need a parent to turn them on");
}

async function shopper() {
  mode = "personal_shopper";
  step("Personal shopper: reset");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Priya" && session.relationship.otpa, "Priya finds, Marcus decides; one-time authorizations on");

  const results = await search("blood pressure monitor");
  const pick = results.find((r) => r.product.offers.filter((o: any) => o.available).length > 1) ?? results[0];
  const offers = pick.product.offers.filter((o: any) => o.available);
  const cheapest = offers[0].priceCents;

  step(`One-Time Purchase Authorization: "find it for ${formatCents(cheapest)} or less"`);
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId, merchant: offers[offers.length - 1].merchant } })).purchase;
  const sent = (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  expect(sent.state === "requested", `Priya sent ${pick.product.title} at ${formatCents(p.reviewedCents)} to Marcus`);
  const hunting = await reviewerPays(sent.reviewPath, { kind: "otpa", maxDollars: cheapest / 100, details: "Standard size", expiresInDays: 7 });
  expect(hunting.state === "hunting" && hunting.otpa.maxCents === cheapest, `PayPal is holding Marcus's maximum, ${formatCents(hunting.otpa.maxCents)}`);
  const options = (await api(`/api/purchases/${p.id}/otpa`)).options as any[];
  const allowed = options.filter((o) => o.allowed);
  const refused = options.find((o) => !o.allowed);
  expect(allowed.length >= 1, `${allowed.length} listing(s) qualify at or under the price`);
  if (refused) expect(/over the approved price/.test(refused.reason), `a pricier store is refused: "${refused.reason}"`);
  const bought = (await api(`/api/purchases/${p.id}/otpa`, { method: "POST", json: { sourceId: allowed[0].sourceId, merchant: allowed[0].merchant } })).purchase;
  expect(bought.state === "completed" && bought.otpa.status === "used", `bought at ${allowed[0].merchant} for ${formatCents(bought.reviewedCents)}`);
  const auth = await paypal.getAuthorization(bought.paypal.authorizationId);
  expect(auth.status === "CAPTURED", "PayPal took exactly that from the hold and released the rest");
  const again = await raw(`/api/purchases/${p.id}/otpa`, { method: "POST", json: { sourceId: allowed[0].sourceId, merchant: allowed[0].merchant } });
  expect(again.status === 409, "a second purchase under the same authorization is refused");

  step("An authorization Marcus cancels: the hold is released");
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const sent2 = (await api(`/api/purchases/${p2.id}/request`, { method: "POST" })).purchase;
  const h2 = await reviewerPays(sent2.reviewPath, { kind: "otpa", maxDollars: 5, details: "", expiresInDays: 1 });
  expect((await api(`/api/purchases/${p2.id}/otpa`)).options.every((o: any) => !o.allowed), "nothing qualifies at $5");
  const canceled = (await api(`/api${sent2.reviewPath}`, { method: "POST", json: { decision: "cancel" } })).purchase;
  expect(canceled.state === "canceled" && (await paypal.getAuthorization(h2.paypal.authorizationId)).status === "VOIDED", "canceled, and PayPal shows VOIDED");

  step("Marcus approves and pays another find directly");
  const p3 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const sent3 = (await api(`/api/purchases/${p3.id}/request`, { method: "POST" })).purchase;
  const paid = await reviewerPays(sent3.reviewPath);
  expect(paid.state === "completed" && paid.paypal.captureId, "paid by Marcus");
}

async function main() {
  const only = process.argv[2];
  if (!only || only === "mom") await mom();
  if (!only || only === "kids") await kids();
  if (!only || only === "shopper") await shopper();
  console.log("\nAll end-to-end checks passed.");
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}`);
  process.exit(1);
});
