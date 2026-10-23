import { describe, expect, it } from "vitest";
import { FAMILY_ELDER_RULES, PARENT_CHILD_RULES } from "../policy";
import { assertTransition, canTransition, decideAfterHold, historyFrom, isFinal, otpaAllows, type Otpa, type PurchaseSummary } from "./lifecycle";

const NOW = new Date("2026-11-01T12:00:00Z");
const base = { currency: "USD", history: [], now: NOW, shopperName: "Mom", reviewerName: "Sarah" };

describe("transitions", () => {
  it("allows the happy paths", () => {
    expect(canTransition("evaluated", "checkout")).toBe(true);
    expect(canTransition("checkout", "completed")).toBe(true);
    expect(canTransition("checkout", "awaiting_review")).toBe(true);
    expect(canTransition("awaiting_review", "completed")).toBe(true);
    expect(canTransition("awaiting_review", "declined")).toBe(true);
  });

  it("never reopens a finished purchase", () => {
    for (const s of ["completed", "declined", "expired", "canceled", "failed", "blocked"] as const) {
      expect(isFinal(s)).toBe(true);
      expect(canTransition(s, "checkout")).toBe(false);
    }
    expect(() => assertTransition("declined", "completed")).toThrow();
  });

  it("can't skip the hold", () => {
    expect(canTransition("evaluated", "completed")).toBe(false);
    expect(canTransition("evaluated", "awaiting_review")).toBe(false);
  });
});

describe("decideAfterHold", () => {
  const usd = (value: string) => ({ value, currency_code: "USD" });

  it("captures straight away when Mom may buy it herself", () => {
    const r = decideAfterHold({ ...base, reviewedCents: 6499, paypalAmount: usd("64.99"), rules: FAMILY_ELDER_RULES, categories: ["medical_device"] });
    expect(r.action).toBe("capture");
  });

  it("waits for Sarah on the $149 monitor", () => {
    const r = decideAfterHold({ ...base, reviewedCents: 14900, paypalAmount: usd("149.00"), rules: FAMILY_ELDER_RULES, categories: ["medical_device"] });
    expect(r.action).toBe("await_review");
  });

  it("voids when PayPal holds a different amount than Mom reviewed", () => {
    const r = decideAfterHold({ ...base, reviewedCents: 14900, paypalAmount: usd("179.00"), rules: FAMILY_ELDER_RULES, categories: ["medical_device"] });
    expect(r).toMatchObject({ action: "void", next: "failed" });
  });

  it("uses PayPal's amount, so a total that crosses a limit goes to review", () => {
    // Reviewed and held at $100.00 exactly: at the medical device limit.
    const r = decideAfterHold({ ...base, reviewedCents: 10000, paypalAmount: usd("100.00"), rules: FAMILY_ELDER_RULES, categories: ["medical_device"] });
    expect(r.action).toBe("await_review");
  });

  it("voids a blocked purchase", () => {
    const r = decideAfterHold({ ...base, reviewedCents: 499, paypalAmount: usd("4.99"), rules: PARENT_CHILD_RULES, categories: ["subscription"] });
    expect(r).toMatchObject({ action: "void", next: "blocked" });
  });

  it("re-checks budgets against purchases made since the shopper first looked", () => {
    const earlier: PurchaseSummary[] = [{ id: "a", state: "completed", createdAt: "2026-10-31T12:00:00Z", categories: ["toys"], amountCents: 2500 }];
    const r = decideAfterHold({
      ...base,
      reviewedCents: 1000,
      paypalAmount: usd("10.00"),
      rules: PARENT_CHILD_RULES,
      categories: ["books"],
      history: historyFrom(earlier),
    });
    expect(r.action).toBe("await_review");
    if (r.action === "await_review") expect(r.decision.outcome).toBe("exception");
  });
});

describe("historyFrom", () => {
  const p = (id: string, state: PurchaseSummary["state"]): PurchaseSummary => ({
    id,
    state,
    createdAt: "2026-10-31T12:00:00Z",
    categories: ["toys"],
    amountCents: 1000,
  });

  it("counts held and completed purchases only, never the current one", () => {
    const h = historyFrom([p("a", "awaiting_review"), p("b", "completed"), p("c", "declined"), p("d", "checkout"), p("e", "evaluated")], "b");
    expect(h.map((x) => x.status)).toEqual(["pending_review"]);
  });
});

describe("one-time purchase authorization", () => {
  const otpa: Otpa = {
    status: "active",
    maxCents: 10000,
    details: "size 10",
    expiresAt: "2026-11-08T12:00:00Z",
    product: { sourceId: "shoe1", title: "Running shoes", brand: "Fleetfoot", modelNumber: "FF-210" },
  };
  const listing = { sourceId: "shoe1", brand: "Fleetfoot", modelNumber: "FF-210", priceCents: 8900, available: true };

  it("allows the exact product at or under the price", () => {
    expect(otpaAllows(otpa, listing, NOW)).toEqual({ ok: true });
    expect(otpaAllows(otpa, { ...listing, priceCents: 10000 }, NOW)).toEqual({ ok: true });
  });

  it("allows the same brand and model listed as another product", () => {
    expect(otpaAllows(otpa, { ...listing, sourceId: "other-listing", brand: "fleetfoot" }, NOW).ok).toBe(true);
  });

  it("refuses substitutions, higher prices, out-of-stock listings and expired or used authorizations", () => {
    expect(otpaAllows(otpa, { ...listing, sourceId: "x", modelNumber: "FF-300" }, NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("different product") });
    expect(otpaAllows(otpa, { ...listing, priceCents: 10001 }, NOW)).toMatchObject({ ok: false, reason: expect.stringContaining("over the approved price") });
    expect(otpaAllows(otpa, { ...listing, available: false }, NOW).ok).toBe(false);
    expect(otpaAllows(otpa, listing, new Date("2026-11-09T00:00:00Z")).ok).toBe(false);
    expect(otpaAllows({ ...otpa, status: "used" }, listing, NOW).ok).toBe(false);
  });

  it("reserves budget while requests and authorizations are open", () => {
    const open = (state: PurchaseSummary["state"]): PurchaseSummary => ({ id: state, state, createdAt: "2026-10-31T12:00:00Z", categories: ["toys"], amountCents: 1000 });
    expect(historyFrom([open("requested"), open("hunting"), open("declined"), open("expired")]).map((h) => h.status)).toEqual(["pending_review", "pending_review"]);
  });
});
