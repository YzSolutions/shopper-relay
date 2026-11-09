// End-to-end run through the real API, Neon, Channel3, Gemini and the PayPal
// sandbox, for all four setups. Wherever a person would approve in
// PayPal's window, this script confirms the order with PayPal's sandbox test
// card instead. SANDBOX ONLY.
//
//   npm run dev                         (in another terminal)
//   npm run e2e                         (BASE_URL defaults to http://localhost:3000)
//   npm run e2e -- kids                 (just one: mom | kids | shopper | agent | standing | bills | ai | priya | sarah | isolation)

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
// Each run is its own visitor, with its own copy of the demo households.
let visitor: string = crypto.randomUUID();

async function raw(path: string, init?: RequestInit & { json?: unknown }) {
  const headers: Record<string, string> = { Cookie: `sr_mode=${mode}; sr_visitor=${visitor}` };
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

  step("Sarah declines and sends Mom a better option");
  const p5 = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase.id);
  const { option } = await api(`/api${p5.reviewPath}/better`);
  expect(option && option.priceCents < p5.reviewedCents, `${option?.title}, ${formatCents(option?.priceCents)} at ${option?.merchant}: cheaper, within Mom's rules`);
  const sentBack = (await api(`/api${p5.reviewPath}`, { method: "POST", json: { decision: "decline", better: option.sourceId } })).purchase;
  expect(sentBack.state === "declined" && (await paypal.getAuthorization(sentBack.paypal.authorizationId)).status === "VOIDED", "declined, and PayPal shows VOIDED");
  const onMomsScreen = (await api(`/api/purchases/${p5.id}`)).log.find((e: any) => e.type === "better_sent");
  expect(onMomsScreen?.detail.sourceId === option.sourceId, `Mom sees it: "${onMomsScreen?.message}"`);
  const fromSarah = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: option.sourceId, merchant: option.merchant } })).purchase;
  expect(fromSarah.decision.outcome === "auto" && fromSarah.recurring === "no", "Mom can buy it on her own, with no repeat charge listed");
  await api(`/api/purchases/${fromSarah.id}/cancel`, { method: "POST" });

  const p4 = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase.id);
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const expired = (await api(`/api/purchases/${p4.id}`)).purchase;
  expect(expired.state === "expired" && (await paypal.getAuthorization(expired.paypal.authorizationId)).status === "VOIDED", "expired, and PayPal shows VOIDED");

  step("Mom loosens a rule; Sarah delays it 3 days to talk, once, and can't block it");
  const current = (await api("/api/session")).rules;
  const loosened = { ...current, categories: { ...current.categories, medical_device: { bands: [{ minCents: 0, maxCents: 50000, outcome: "auto" }, { minCents: 50000, maxCents: null, outcome: "review" }] } } };
  await api("/api/rules", { method: "POST", json: { rules: loosened, by: "shopper" } });
  expect((await raw("/api/rules/pending", { method: "POST", json: { action: "delay", by: "shopper" } })).status === 403, "Mom can't use Sarah's delay");
  await api("/api/rules/pending", { method: "POST", json: { action: "delay", by: "reviewer" } });
  const heldBack = await api("/api/session");
  expect(heldBack.pending?.delayedAt && Date.parse(heldBack.pending.autoActivateAt) > Date.now() + 2.9 * 24 * 3600_000, "it now starts in 3 days");
  expect((await raw("/api/rules/pending", { method: "POST", json: { action: "delay", by: "reviewer" } })).status === 409, "a second delay is refused");
  expect((await raw("/api/rules/pending", { method: "POST", json: { action: "drop", by: "reviewer" } })).status === 403, "Sarah still can't cancel it");
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  expect((await api("/api/session")).pending, "past the old 24 hours, it's still waiting");
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 48 } });
  const started = await api("/api/session");
  expect(!started.pending && started.rules.categories.medical_device.bands[0].maxCents === 50000, "after the 3 days, it starts");
  expect((await api("/api/rules/history")).history.some((h: any) => h.type === "rules_delayed"), "the delay is in the rule history");

  step("Video games go to Marcus: a reviewer change waits 24 hours, then Marcus is asked");
  const rules = (await api("/api/session")).rules;
  const withMarcus = { ...rules, categories: { ...rules.categories, video_games: { ...rules.categories.general, reviewer: "Marcus" } } };
  const change = await api("/api/rules", { method: "POST", json: { rules: withMarcus, by: "shopper" } });
  expect(change.notify === "reviewer" && change.state.pending, "treated as loosening: Sarah is told and it waits");
  await api("/api/demo", { method: "POST", json: { action: "advance", hours: 24 } });
  const s2 = await api("/api/session");
  expect(!s2.pending && s2.reviewers.includes("Marcus"), "after 24 hours, Marcus reviews video games");
  const game = (await search("video game controller")).find((r) => r.category.primary === "video_games" && r.preview?.outcome === "review");
  if (game) {
    const g = await shopperPays((await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: game.product.sourceId } })).purchase.id);
    expect(g.state === "awaiting_review" && g.reviewerName === "Marcus", `${game.product.title}: waiting for Marcus, not Sarah`);
    await api(`/api${g.reviewPath}`, { method: "POST", json: { decision: "decline" } });
  } else {
    console.log("  (no video game over $150 in today's catalog; skipped the purchase check)");
  }
  await tourDone("boughtAlone", "checkedChosen", "heldDecided", "rulesChanged");
}

async function kids() {
  mode = "parent_child";
  step("Kids + parent: reset");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Leo" && session.relationship.flow === "request", "Leo asks, Sarah approves and pays");
  expect(session.budget.length === 2, `budgets: ${session.budget.map((b: any) => `${formatCents(b.limitCents)} a ${b.period}`).join(", ")}`);

  step("Leo asks for something; Sarah approves and pays");
  const results = await search("kids book");
  const pick = results.find((r) => r.product.offers[0]?.priceCents <= 3000) ?? results[0];
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  expect(p.state === "evaluated" && p.flow === "request", `${pick.product.title} (${formatCents(p.reviewedCents)}): ${p.decision.outcome}`);
  const sent = (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  expect(sent.state === "requested" && sent.reviewPath, "request sent to Sarah; nothing paid yet");
  const reserved = (await api("/api/session")).budget[0];
  expect(reserved.reservedCents === p.reviewedCents, `${formatCents(reserved.reservedCents)} set aside in this week's budget while it waits`);
  const paid = await reviewerPays(sent.reviewPath);
  expect(paid.state === "completed" && paid.paypal.captureId, `Sarah paid: PayPal capture ${paid.paypal.captureId}`);
  const after = (await api("/api/session")).budget[0];
  expect(after.spentCents === p.reviewedCents && after.reservedCents === 0, "it now counts as spent, not reserved");

  step("Sarah says no to the next one: nothing paid, budget released");
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const sent2 = (await api(`/api/purchases/${p2.id}/request`, { method: "POST" })).purchase;
  const no = (await api(`/api${sent2.reviewPath}`, { method: "POST", json: { decision: "decline" } })).purchase;
  expect(no.state === "declined" && !no.paypal.authorizationId, "declined; PayPal never involved");
  expect((await api("/api/session")).budget[0].reservedCents === 0, "the reserved amount is released");

  step("A subscription is blocked for kids");
  const check = await checkoutScreenshot();
  const sub = (await api("/api/purchases", { method: "POST", json: { kind: "checked", checkId: check.checkId } })).purchase;
  expect(sub.state === "blocked", "blocked: subscriptions need a parent to turn them on");

  step("Video games go to Marcus, on Marcus's own tab");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  expect((await api("/api/session")).reviewers.includes("Marcus"), "Sarah and Marcus each have an inbox");
  const game = (await search("video game controller")).find((r) => r.category.primary === "video_games");
  if (game) {
    const g = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: game.product.sourceId } })).purchase;
    const asked = (await api(`/api/purchases/${g.id}/request`, { method: "POST" })).purchase;
    expect(asked.state === "requested" && asked.reviewerName === "Marcus", `${game.product.title} (${formatCents(g.reviewedCents)}): waiting for Marcus, not Sarah`);
    const dad = await reviewerPays(asked.reviewPath);
    expect(dad.state === "completed" && dad.paypal.captureId, `Marcus paid: PayPal capture ${dad.paypal.captureId}`);
  } else {
    console.log("  (no video game in today's catalog; skipped the purchase check)");
  }
  await tourDone("requested", "requestDecided");
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

/** Marcus saves his PayPal once; Priya then buys what his rules allow without asking. */
/** The guided tour's ticks come from what really happened in this visitor's demo. */
async function tourDone(...steps: string[]) {
  const { facts } = await api("/api/demo");
  for (const s of steps) expect(facts[s], `the guided tour ticks off ${s}`);
}

async function agent() {
  mode = "personal_shopper";
  step("The AI shopper: Marcus authorizes one product, the AI shopper finds and buys it");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  expect(Object.values((await api("/api/demo")).facts).every((done) => !done), "after a reset, the guided tour starts from nothing");
  const results = await search("blood pressure monitor");
  const pick = results.find((r) => r.product.offers.some((o: any) => o.available)) ?? results[0];
  const offers = pick.product.offers.filter((o: any) => o.available);
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId, merchant: offers[offers.length - 1].merchant } })).purchase;
  const sent = (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  const hunting = await reviewerPays(sent.reviewPath, { kind: "otpa", maxDollars: offers[0].priceCents / 100, details: "", expiresInDays: 7 });
  expect(hunting.state === "hunting", `PayPal is holding ${formatCents(hunting.otpa.maxCents)} for ${pick.product.title}`);
  const run = await api(`/api/purchases/${p.id}/agent`, { method: "POST" });
  for (const s of run.steps) console.log(`    · [${s.kind}] ${s.text}`);
  expect(run.purchase.state === "completed" && run.purchase.otpa.status === "used", `the AI shopper bought it for ${formatCents(run.purchase.reviewedCents)}`);
  expect(run.purchase.reviewedCents <= hunting.otpa.maxCents, "at or under Marcus's maximum");
  const auth = await paypal.getAuthorization(run.purchase.paypal.authorizationId);
  expect(auth.status === "CAPTURED", "PayPal captured it from the hold");
  const log = (await api(`/api/purchases/${p.id}`)).log as any[];
  expect(log.some((e) => e.actor === "agent" && e.type === "otpa_used"), "the why log shows the AI shopper bought it");
  const again = await raw(`/api/purchases/${p.id}/agent`, { method: "POST" });
  expect(again.status === 409, "sending it again is refused: one product, once");
  await tourDone("requested", "otpaGranted", "otpaUsed");
}

async function standing() {
  mode = "personal_shopper";
  step("Standing permission: Marcus lets Priya buy shoes up to $80 on her own");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  const rules = structuredClone(session.rules);
  rules.categories.shoes_handbags = {
    bands: [
      { minCents: 0, maxCents: 80_01, outcome: "auto" },
      { minCents: 80_01, maxCents: 150_01, outcome: "review" },
      { minCents: 150_01, maxCents: null, outcome: "exception" },
    ],
  };
  await api("/api/rules", { method: "POST", json: { rules, by: "reviewer", householdId: session.household.id } });
  const history = (await api("/api/rules/history")).history as any[];
  expect(history[0]?.type === "rules_changed" && history[0].actor === "reviewer" && history[0].change?.after, "the change is in the rule history, with before and after");

  const results = [...(await search("sneakers")), ...(await search("flip flops"))];
  const cheap = results.find((r) => r.preview?.outcome === "auto");
  const pricey = results.find((r) => r.preview && r.preview.outcome !== "auto" && r.category.primary === "shoes_handbags");
  expect(cheap, `${cheap?.product.title} (${formatCents(cheap?.product.offers[0].priceCents)}) is within Marcus's rules`);
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: cheap.product.sourceId } })).purchase;
  expect((await raw(`/api/purchases/${p.id}/standing`, { method: "POST" })).status === 409, "without standing permission, it can't be bought yet");

  step("Marcus saves a payment method with PayPal (a sandbox test card stands in for his PayPal)");
  const setup = await paypal.createTestCardSetupToken(TEST_CARD);
  const on = (await api("/api/standing", { method: "POST", json: { action: "confirm", setupTokenId: setup.id } })).standing;
  expect(on && (await api("/api/session")).standing, `standing permission is on (${on.payerLabel})`);

  step("Priya buys it without asking: PayPal holds Marcus's saved method, checks the amount, then captures");
  const bought = (await api(`/api/purchases/${p.id}/standing`, { method: "POST" })).purchase;
  expect(bought.state === "completed" && bought.standing && bought.paypal.captureId, `bought for ${formatCents(bought.paypalCapturedCents)}`);
  expect(bought.paypalCapturedCents === p.reviewedCents, "PayPal took exactly the price Priya saw");
  expect((await paypal.getAuthorization(bought.paypal.authorizationId)).status === "CAPTURED", "PayPal shows the hold CAPTURED");
  const again = (await api(`/api/purchases/${p.id}/standing`, { method: "POST" })).purchase;
  expect(again.paypal.captureId === bought.paypal.captureId, "a second click doesn't charge twice");

  if (pricey) {
    const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pricey.product.sourceId } })).purchase;
    const r = await raw(`/api/purchases/${p2.id}/standing`, { method: "POST" });
    expect(r.status === 409, `${formatCents(p2.reviewedCents)} is over the limit, so it still goes to Marcus`);
  }

  step("Marcus turns it off");
  await api("/api/standing", { method: "POST", json: { action: "revoke" } });
  expect(!(await api("/api/session")).standing, "standing permission is off");
  const p3 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: cheap.product.sourceId } })).purchase;
  expect((await raw(`/api/purchases/${p3.id}/standing`, { method: "POST" })).status === 409, "and buying without asking is refused again");
}

/** Priya bills Marcus for her time with a PayPal invoice; the items were paid separately. */
async function bills() {
  mode = "personal_shopper";
  step("Bills: Priya bills Marcus for her time");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const [pick] = await search("wireless headphones");
  const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const sent = (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  const paid = await reviewerPays(sent.reviewPath);
  expect(paid.state === "completed", `Marcus paid for ${paid.item.title} (${formatCents(paid.paypalCapturedCents)})`);

  const { billable } = await api("/api/bills");
  expect(billable.some((b: any) => b.id === p.id), "the finished purchase can be listed on a bill");
  const tooBig = await raw("/api/bills", { method: "POST", json: { action: "send", amountCents: 900_00, note: "Too much", purchaseIds: [] } });
  expect(tooBig.status === 400, "a bill over $500 is refused");
  const notDone = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: pick.product.sourceId } })).purchase;
  const unfinished = await raw("/api/bills", { method: "POST", json: { action: "send", amountCents: 10_00, note: "Early", purchaseIds: [notDone.id] } });
  expect(unfinished.status === 400, "a bill can't list a purchase that isn't finished");

  const bill = (await api("/api/bills", { method: "POST", json: { action: "send", amountCents: 25_00, note: "Shopping this week", purchaseIds: [p.id] } })).bill;
  expect(bill.status === "unpaid" && bill.paypalInvoiceId && bill.payerUrl?.startsWith("https://www.sandbox.paypal.com/"), `PayPal invoice ${bill.invoiceNumber} sent, with a PayPal pay link`);
  const invoice = await paypal.getInvoice(bill.paypalInvoiceId);
  expect(invoice.status === "UNPAID" && invoice.amount?.value === "25.00", "PayPal shows it UNPAID for $25.00");
  expect(bill.items.length === 1 && bill.items[0].id === p.id, "the bill lists the purchase it covers");

  step("Marcus pays it (the sandbox records a payment in place of Marcus paying on PayPal's page)");
  await paypal.recordInvoicePayment(bill.paypalInvoiceId, 25_00);
  // The app asks PayPal about an unpaid bill at most every 10 seconds.
  let after: any;
  for (let i = 0; i < 15 && after?.status !== "paid"; i++) {
    if (i) await new Promise((r) => setTimeout(r, 2000));
    after = (await api("/api/bills")).bills.find((b: any) => b.id === bill.id);
  }
  expect(after.status === "paid" && after.paidAt && !after.payerUrl, "the bill shows paid, and the pay link is gone");
  const log = (await api("/api/log")).events as any[];
  expect(log.filter((e) => e.type === "bill_paid").length === 1 && log.some((e) => e.type === "bill_sent"), "the history records it sent, and paid once");
  expect((await raw("/api/bills", { method: "POST", json: { action: "cancel", id: bill.id } })).status === 409, "a paid bill can't be withdrawn");

  step("Priya withdraws a second bill");
  const second = (await api("/api/bills", { method: "POST", json: { action: "send", amountCents: 12_50, note: "Returns trip", purchaseIds: [] } })).bill;
  const withdrawn = (await api("/api/bills", { method: "POST", json: { action: "cancel", id: second.id } })).bill;
  expect(withdrawn.status === "canceled" && (await paypal.getInvoice(second.paypalInvoiceId)).status === "CANCELLED", "withdrawn, and PayPal shows CANCELLED");

  await tourDone("billSent");
  mode = "family_elder";
  const elsewhere = await raw("/api/bills", { method: "POST", json: { action: "send", amountCents: 10_00, note: "Nope", purchaseIds: [] } });
  expect(elsewhere.status === 400, "Mom + Sarah has no bills");
}

/** Two visitors at once: each has their own households, and a reset touches only its own. */
async function isolation() {
  mode = "family_elder";
  step("Two visitors at the same time");
  const a = visitor;
  const b = crypto.randomUUID();
  const as = async <T>(who: string, fn: () => Promise<T>) => {
    visitor = who;
    try {
      return await fn();
    } finally {
      visitor = a;
    }
  };
  const [first] = await search("reading glasses");
  const mine = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: first.product.sourceId } })).purchase;
  const theirSession = await as(b, () => api("/api/session"));
  expect(theirSession.household.id !== (await api("/api/session")).household.id, "each visitor gets their own household");
  const theirs = await as(b, () => api("/api/purchases"));
  expect(!theirs.purchases.some((p: any) => p.id === mine.id), "the other visitor can't see my purchase");
  expect((await as(b, () => raw(`/api/purchases/${mine.id}`))).status === 404, "or open it by its id");
  await as(b, () => api("/api/demo", { method: "POST", json: { action: "reset" } }));
  expect((await api(`/api/purchases/${mine.id}`)).purchase.id === mine.id, "their reset leaves my demo alone");
  const fresh = await fetch(`${BASE}/api/session`);
  expect(/sr_visitor=/.test(fresh.headers.get("set-cookie") ?? ""), "a new browser is handed its own visitor id");
}

async function aiShopper() {
  mode = "ai_shopper";
  step("AI Shopper: reset");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "AI Shopper" && session.household.reviewerName === "Sarah", "the AI shops, Sarah owns the rules");

  step("Before any rule, everything goes to Sarah");
  const first = await api("/api/agent", { method: "POST", json: { goal: "a modern desk clock under $25" } });
  for (const s of first.steps) console.log(`    · [${s.kind}] ${s.text}`);
  expect(first.purchase?.state === "requested", `${first.purchase?.item.title}: asked Sarah, nothing paid`);
  await api(`/api/purchases/${first.purchase.id}/cancel`, { method: "POST" }); // an open request reserves the weekly budget

  step("Sarah writes a rule in plain words: it must not open up the store's whole category");
  const parsed = await api("/api/rules/parse", { method: "POST", json: { text: "The AI shopper can buy desk clocks under $25 without asking", householdId: session.household.id } });
  console.log(`    · ${parsed.summary}`);
  const auto = Object.entries(parsed.rules.categories).filter(([, r]: any) => r.bands.some((b: any) => b.outcome === "auto")).map(([k]) => k);
  expect(auto.length === 1 && auto[0] !== "home_decor", `only "${auto[0]}" can be bought without asking`);
  expect(parsed.rules.custom?.[auto[0]]?.all?.length, `exact words: ${parsed.rules.custom?.[auto[0]]?.all?.join(", ")}; not: ${parsed.rules.custom?.[auto[0]]?.not?.join(", ")}`);
  await api("/api/rules", { method: "POST", json: { rules: parsed.rules, by: "reviewer", householdId: session.household.id } });

  step("Sarah saves a payment method (a sandbox test card stands in for her PayPal)");
  const setup = await paypal.createTestCardSetupToken(TEST_CARD);
  await api("/api/standing", { method: "POST", json: { action: "confirm", setupTokenId: setup.id } });

  step("Within the rule, the AI buys it");
  const job = await api("/api/agent", { method: "POST", json: { goal: "a modern desk clock under $25" } });
  for (const s of job.steps) console.log(`    · [${s.kind}] ${s.text}`);
  expect(job.purchase?.state === "completed" && job.purchase.standing && job.purchase.paypal.captureId, `${job.purchase?.item.title}: bought, PayPal capture ${job.purchase?.paypal.captureId}`);
  expect(job.purchase.paypalCapturedCents === job.purchase.reviewedCents && job.purchase.reviewedCents <= 25_00, `PayPal took exactly the listed price, ${formatCents(job.purchase.reviewedCents)}`);

  step("Sarah puts the office Secret Santa on her calendar, and the AI shops ahead for it");
  const santa = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const added = (await api("/api/occasions", { method: "POST", json: { action: "add", title: "Office Secret Santa", date: santa, job: "a modern desk clock under $25", daysAhead: 7 } })).occasions;
  const shopped = await api("/api/occasions", { method: "POST", json: { action: "shop", id: added[0].id } });
  expect(shopped.purchase?.state === "completed" && shopped.purchase.reviewedCents <= 25_00, `${shopped.purchase?.item.title}: bought ahead for ${formatCents(shopped.purchase?.reviewedCents ?? 0)}`);
  const again = await raw("/api/occasions", { method: "POST", json: { action: "shop", id: added[0].id } });
  expect(again.status === 409, "and it's never shopped for twice");

  step("Outside the rule, the AI asks Sarah");
  const out = await api("/api/agent", { method: "POST", json: { goal: "gaming laptop" } });
  for (const s of out.steps) console.log(`    · [${s.kind}] ${s.text}`);
  expect(out.purchase?.state === "requested" && out.purchase.reviewerName === "Sarah", `${out.purchase?.item.title}: asked Sarah, nothing paid`);
  await api("/api/standing", { method: "POST", json: { action: "revoke" } });
  await tourDone("rulesChanged", "standingOn", "occasionAdded", "occasionShopped", "goalBought", "goalAsked");
}

/** The video's Priya story: $200 on her own, over that goes to Marcus, who sets a one-time limit, and PayPal releases the rest. */
async function priya() {
  mode = "personal_shopper";
  step("Priya's budget: reset, then the rule in plain words");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  const parsed = await api("/api/rules/parse", { method: "POST", json: { text: "Priya can buy clothing up to $200 without asking", householdId: session.household.id } });
  console.log(`    · ${parsed.summary}`);
  expect(!parsed.questions?.length, "no questions back");
  const bands = parsed.rules.categories.clothing?.bands ?? [];
  console.log(`    · clothing: ${JSON.stringify(bands)}`);
  expect(bands.some((b: any) => b.outcome === "auto"), "clothing can be bought without asking");
  expect(Object.entries(parsed.rules.categories).filter(([, r]: any) => r.bands.some((b: any) => b.outcome === "auto")).length === 1, "and nothing else can");
  await api("/api/rules", { method: "POST", json: { rules: parsed.rules, by: "reviewer", householdId: session.household.id } });

  step("Marcus saves a payment method (a sandbox test card stands in for his PayPal)");
  const setup = await paypal.createTestCardSetupToken(TEST_CARD);
  await api("/api/standing", { method: "POST", json: { action: "confirm", setupTokenId: setup.id } });

  step("Under $200, Priya buys without asking");
  const under = (await search("mens navy suit")).find((r) => r.category.primary === "clothing" && r.preview?.outcome === "auto");
  expect(under, `${under?.product.title}, ${formatCents(under?.product.offers[0].priceCents)}: within the rule`);
  const p1 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: under.product.sourceId } })).purchase;
  const bought = (await api(`/api/purchases/${p1.id}/standing`, { method: "POST" })).purchase;
  expect(bought.state === "completed" && bought.standing, `bought for ${formatCents(bought.paypalCapturedCents)}, no approval needed`);

  step("The $250 jacket goes to Marcus");
  const jackets = await search("Solid Navy Sportcoat");
  const jacket = jackets.find((r) => r.product.title === "Solid Navy Sportcoat") ?? jackets.find((r) => r.category.primary === "clothing" && r.preview?.outcome === "exception");
  expect(jacket, `${jacket?.product.title}, ${formatCents(jacket?.product.offers[0].priceCents)}`);
  expect(jacket.category.primary === "clothing" && jacket.preview.outcome === "exception", `counted as clothing and flagged over budget: "${jacket.preview.reasons[0].message}"`);
  const p2 = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: jacket.product.sourceId } })).purchase;
  const sent = (await api(`/api/purchases/${p2.id}/request`, { method: "POST" })).purchase;
  expect(sent.state === "requested" && sent.reviewerName === "Marcus", "Priya sent it to Marcus");

  step("Marcus sets a one-time limit above the price; PayPal charges the price and releases the rest");
  const maxDollars = Math.ceil(p2.reviewedCents / 100) + 25;
  const hunting = await reviewerPays(sent.reviewPath, { kind: "otpa", maxDollars, details: "", expiresInDays: 7 });
  expect(hunting.state === "hunting" && hunting.otpa.maxCents === maxDollars * 100, `PayPal is holding ${formatCents(hunting.otpa.maxCents)}`);
  const allowed = (await api(`/api/purchases/${p2.id}/otpa`)).options.find((o: any) => o.allowed);
  const done = (await api(`/api/purchases/${p2.id}/otpa`, { method: "POST", json: { sourceId: allowed.sourceId, merchant: allowed.merchant } })).purchase;
  expect(done.state === "completed" && done.paypalCapturedCents < hunting.otpa.maxCents, `charged ${formatCents(done.paypalCapturedCents)}, the rest released`);
  await api("/api/standing", { method: "POST", json: { action: "revoke" } });
}

/** Sarah shops for herself, and her PayPal table shows what charged her account, from every relationship. */
async function sarah() {
  const ask = async (sourceId: string) => {
    const p = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId } })).purchase;
    return (await api(`/api/purchases/${p.id}/request`, { method: "POST" })).purchase;
  };
  const titled = (rows: any[], t: string) => rows.find((r: any) => r.item.title === t);

  mode = "parent_child";
  step("Leo asks for a pricey hoodie; Sarah says no, then pays for a cheaper one");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const hoodies = (await search("kids hoodie")).filter((r) => r.product.offers[0]).sort((a, b) => a.product.offers[0].priceCents - b.product.offers[0].priceCents);
  const pricey = hoodies[hoodies.length - 1];
  const cheap = hoodies[0];
  expect(pricey && cheap && pricey.product.sourceId !== cheap.product.sourceId, `${pricey.product.title} vs ${cheap.product.title}`);
  const no = (await api(`/api${(await ask(pricey.product.sourceId)).reviewPath}`, { method: "POST", json: { decision: "decline" } })).purchase;
  expect(no.state === "declined", `Sarah declined ${no.item.title} (${formatCents(no.reviewedCents)})`);
  const yes = await reviewerPays((await ask(cheap.product.sourceId)).reviewPath);
  expect(yes.state === "completed", `Sarah paid for ${yes.item.title} (${formatCents(yes.reviewedCents)})`);
  const tech = (await search("wireless headphones")).find((r) => r.category.primary === "electronics");
  let marcusPaid: string | null = null;
  if (tech) {
    const asked = await ask(tech.product.sourceId);
    expect(asked.reviewerName === "Marcus", `${asked.item.title} goes to Marcus`);
    marcusPaid = (await reviewerPays(asked.reviewPath)).item.title;
  } else {
    console.log("  (no electronics in today's catalog; skipped Marcus's purchase)");
  }

  mode = "family_elder";
  step("Mom buys something with her own money");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const glasses = (await search("reading glasses")).find((r) => r.preview?.outcome === "auto");
  const momChose = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: glasses.product.sourceId } })).purchase;
  const momPaid = await shopperPays(momChose.id);
  expect(momPaid.state === "completed", `Mom paid for ${momPaid.item.title} herself`);

  mode = "self";
  step("Sarah shops for herself and pays with her own PayPal");
  await api("/api/demo", { method: "POST", json: { action: "reset" } });
  const session = await api("/api/session");
  expect(session.household.shopperName === "Sarah" && session.relationship.payer === "shopper", "Sarah's own tab: she shops and pays");
  const bed = (await search("bed set"))[0];
  const chose = (await api("/api/purchases", { method: "POST", json: { kind: "catalog", sourceId: bed.product.sourceId } })).purchase;
  expect(chose.decision.outcome === "auto", "her own rules let her buy it");
  const bought = await shopperPays(chose.id);
  expect(bought.state === "completed" && bought.paypal.captureId, `Sarah bought ${bought.item.title}: PayPal capture ${bought.paypal.captureId}`);

  step("Sarah's PayPal table: everything charged to her account, and nothing else");
  const mine = await api("/api/purchases/account");
  expect(mine.holder === "Sarah", "the table is Sarah's PayPal");
  expect(titled(mine.purchases, bought.item.title)?.people.for === "Sarah", "her bed set, for Sarah");
  expect(titled(mine.purchases, no.item.title)?.state === "declined" && titled(mine.purchases, no.item.title).people.for === "Leo", "Leo's hoodie she said no to, for Leo");
  expect(titled(mine.purchases, yes.item.title)?.state === "completed", "the cheaper hoodie she paid for");
  expect(!titled(mine.purchases, momPaid.item.title), "not Mom's own shopping");
  if (marcusPaid) expect(!titled(mine.purchases, marcusPaid), "not Leo's tech, which Marcus paid for");
  expect(mine.purchases.every((p: any) => p.here === (p.people.shopper === "Sarah")), "only her own rows open from this tab");
  await tourDone("boughtAlone");

  mode = "personal_shopper";
  const his = await api("/api/purchases/account");
  expect(his.holder === "Marcus", "Priya's tab shows Marcus's PayPal");
  if (marcusPaid) expect(titled(his.purchases, marcusPaid)?.people.for === "Leo", "with Leo's tech that Marcus paid for");
}

async function main() {
  const only = process.argv[2];
  if (!only || only === "isolation") await isolation();
  if (!only || only === "mom") await mom();
  if (!only || only === "kids") await kids();
  if (!only || only === "shopper") await shopper();
  if (!only || only === "agent") await agent();
  if (!only || only === "standing") await standing();
  if (!only || only === "bills") await bills();
  if (!only || only === "ai") await aiShopper();
  if (!only || only === "priya") await priya();
  if (!only || only === "sarah") await sarah();
  console.log("\nAll end-to-end checks passed.");
}

main().catch((err) => {
  console.error(`\n${err.message ?? err}`);
  process.exit(1);
});
