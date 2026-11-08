import { describe, expect, it } from "vitest";
import { occasionStatus, shopDay, type OccasionView } from "./occasions";

const base: OccasionView = { id: "1", title: "Office Secret Santa", date: "2026-12-18", job: "Desk clock under $25", daysAhead: 7, shoppedAt: null, note: null, purchase: null };

describe("shopDay", () => {
  it("counts back across a month", () => expect(shopDay("2026-12-03", 7)).toBe("2026-11-26"));
  it("is the day itself at 0", () => expect(shopDay("2026-12-18", 0)).toBe("2026-12-18"));
});

describe("occasionStatus", () => {
  it("names the shop day before it comes", () => expect(occasionStatus(base, "2026-11-08", "Sarah")).toEqual({ words: "Shops Dec 11", tone: "plain" }));
  it("is due from the shop day until the date", () => {
    expect(occasionStatus(base, "2026-12-11", "Sarah").tone).toBe("due");
    expect(occasionStatus(base, "2026-12-18", "Sarah").tone).toBe("due");
  });
  it("has passed after the date if it never shopped", () => expect(occasionStatus(base, "2026-12-19", "Sarah").tone).toBe("past"));
  it("follows the purchase", () => {
    const p = { id: "p", title: "Clock", amountCents: 2199 };
    expect(occasionStatus({ ...base, shoppedAt: "x", purchase: { ...p, state: "completed" } }, "2026-12-12", "Sarah")).toEqual({ words: "Bought for $21.99", tone: "done" });
    expect(occasionStatus({ ...base, shoppedAt: "x", purchase: { ...p, state: "requested" } }, "2026-12-12", "Sarah").words).toBe("Waiting for Sarah");
    expect(occasionStatus({ ...base, shoppedAt: "x", purchase: { ...p, state: "declined" } }, "2026-12-12", "Sarah").words).toBe("Sarah said no");
  });
  it("says when it found nothing", () => expect(occasionStatus({ ...base, shoppedAt: "x", note: "Nothing fit." }, "2026-12-12", "Sarah").tone).toBe("stop"));
});
