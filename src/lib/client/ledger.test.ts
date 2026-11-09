import { describe, expect, it } from "vitest";
import { ledgerRows, paidLately, type LedgerPurchase } from "./ledger";

const NOW = new Date("2026-11-08T12:00:00Z");
const names = { shopper: "Leo", reviewer: "Sarah" };
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600_000).toISOString();

function purchase(over: Partial<LedgerPurchase>): LedgerPurchase {
  return {
    id: "p",
    state: "completed",
    flow: "request",
    createdAt: daysAgo(1),
    item: { title: "Kids Book" },
    category: { primary: "books" },
    decision: { outcome: "review" },
    reviewerName: null,
    reviewedCents: 1500,
    paypalCapturedCents: null,
    standing: false,
    otpa: null,
    paypal: { authorizationId: "AUTH", captureId: null },
    ...over,
  };
}

describe("the spending table", () => {
  it("shows what PayPal charged and who decided", () => {
    const [jacket] = ledgerRows([purchase({ id: "j", otpa: { maxCents: 27500 }, reviewerName: "Marcus", reviewedCents: 25000, paypalCapturedCents: 25000, paypal: { authorizationId: "A", captureId: "CAP1" } })], names);
    expect(jacket).toMatchObject({ amount: 250, status: "Paid", decidedBy: "Marcus's one-time limit", paypalId: "CAP1", category: "Books" });
    expect(ledgerRows([purchase({ decision: { outcome: "auto" }, flow: "hold" })], names)[0].decidedBy).toBe("Leo's own rules");
    expect(ledgerRows([purchase({ standing: true, decision: { outcome: "auto" } })], names)[0].decidedBy).toBe("Sarah's saved PayPal");
  });

  it("says who it's waiting for, and why it stopped", () => {
    expect(ledgerRows([purchase({ state: "requested", reviewerName: "Marcus" })], names)[0]).toMatchObject({ status: "Waiting", decidedBy: "Waiting for Marcus" });
    expect(ledgerRows([purchase({ state: "declined" })], names)[0]).toMatchObject({ status: "Declined", decidedBy: "Sarah" });
    expect(ledgerRows([purchase({ state: "expired" })], names)[0]).toMatchObject({ status: "Released", decidedBy: "No answer in time" });
  });

  it("in a PayPal table across relationships, uses each row's own people", () => {
    const bed = ledgerRows([purchase({ flow: "hold", decision: { outcome: "auto" }, people: { shopper: "Sarah", reviewer: "Sarah", for: "Sarah" }, here: false })], names)[0];
    expect(bed).toMatchObject({ forName: "Sarah", decidedBy: "Sarah", here: false });
    const clock = ledgerRows([purchase({ standing: true, decision: { outcome: "auto" }, people: { shopper: "AI Shopper", reviewer: "Sarah", for: "Sarah" } })], names)[0];
    expect(clock).toMatchObject({ forName: "Sarah", decidedBy: "Sarah's saved PayPal", here: true });
    expect(ledgerRows([purchase({ state: "declined" })], names)[0].forName).toBe("Leo");
  });

  it("leaves out purchases that were only looked at", () => {
    expect(ledgerRows([purchase({ state: "evaluated" }), purchase({ state: "checkout" })], names)).toEqual([]);
  });

  it("totals only what was paid in the last 30 days", () => {
    const rows = ledgerRows(
      [
        purchase({ id: "a", paypalCapturedCents: 1999 }),
        purchase({ id: "b", paypalCapturedCents: 1001, createdAt: daysAgo(29) }),
        purchase({ id: "old", paypalCapturedCents: 5000, createdAt: daysAgo(31) }),
        purchase({ id: "open", state: "requested", reviewedCents: 9000 }),
      ],
      names,
    );
    expect(paidLately(rows, NOW)).toBe(30);
  });
});
