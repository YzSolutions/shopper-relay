import { describe, expect, it } from "vitest";
import {
  categoryFromCatalog,
  changeWords,
  closeCentGaps,
  evaluatePurchase,
  fillGaps,
  findRuleIssues,
  summarizeChange,
  type AmountBand,
  type RuleSet,
} from "./index";

const NOW = new Date("2026-11-01T12:00:00Z");

describe("closeCentGaps", () => {
  it("'under $100 … over $100' covers exactly $100, on the stricter side", () => {
    const bands = closeCentGaps([
      { minCents: 0, maxCents: 10000, outcome: "auto" },
      { minCents: 10001, maxCents: null, outcome: "review" },
    ]);
    expect(bands).toEqual([
      { minCents: 0, maxCents: 10000, outcome: "auto" },
      { minCents: 10000, maxCents: null, outcome: "review" },
    ]);
    expect(findRuleIssues({ categories: { general: { bands } }, caps: [] })).toEqual([]);
  });

  it("'up to $100 … $100 and up' no longer overlaps at $100", () => {
    expect(
      closeCentGaps([
        { minCents: 0, maxCents: 10001, outcome: "auto" },
        { minCents: 10000, maxCents: null, outcome: "review" },
      ]),
    ).toEqual([
      { minCents: 0, maxCents: 10000, outcome: "auto" },
      { minCents: 10000, maxCents: null, outcome: "review" },
    ]);
  });

  it("leaves real gaps for the owner to answer", () => {
    const bands: AmountBand[] = [
      { minCents: 0, maxCents: 7500, outcome: "auto" },
      { minCents: 15001, maxCents: null, outcome: "review" },
    ];
    expect(closeCentGaps(bands)).toEqual(bands);
  });
});

describe("fillGaps", () => {
  it("keeps the old rule for amounts a new sentence doesn't mention", () => {
    const general: AmountBand[] = [
      { minCents: 0, maxCents: 7500, outcome: "auto" },
      { minCents: 7500, maxCents: null, outcome: "review" },
    ];
    expect(fillGaps([{ minCents: 20001, maxCents: null, outcome: "blocked" }], general)).toEqual([
      { minCents: 0, maxCents: 7500, outcome: "auto" },
      { minCents: 7500, maxCents: 20001, outcome: "review" },
      { minCents: 20001, maxCents: null, outcome: "blocked" },
    ]);
  });
});

describe("reasons name the right people", () => {
  const rules: RuleSet = {
    categories: {
      general: { bands: [{ minCents: 0, maxCents: null, outcome: "review" }] },
      video_games: { bands: [{ minCents: 0, maxCents: 2001, outcome: "review" }, { minCents: 2001, maxCents: null, outcome: "exception" }], reviewer: "Marcus" },
      toys: { bands: [{ minCents: 0, maxCents: null, outcome: "blocked" }] },
    },
    caps: [{ category: null, period: "week", limitCents: 3000, over: "exception" }],
  };
  const kids = { now: NOW, shopperName: "Leo", reviewerName: "Sarah", flow: "request" as const, ruleOwner: "reviewer" as const };

  it("says the reviewer decides where they approve and pay", () => {
    const d = evaluatePurchase(rules, { amountCents: 1000, categories: ["general"] }, [], kids);
    expect(d.reasons[0].message).toBe("Sarah decides on everyday purchases of any amount.");
  });

  it("when two people are named, every reason names the one actually asked", () => {
    const d = evaluatePurchase(rules, { amountCents: 5000, categories: ["video_games", "general"] }, [], kids);
    expect(d.reviewer).toBe("Sarah");
    expect(d.reasons.map((r) => r.message).join(" ")).not.toContain("Marcus");
  });

  it("a spending limit goes to whoever the purchase's category names", () => {
    const d = evaluatePurchase(rules, { amountCents: 5000, categories: ["video_games"] }, [], kids);
    expect(d.reviewer).toBe("Marcus");
    expect(d.reasons.map((r) => r.message).join(" ")).toContain("Marcus must approve an exception");
  });

  it("Mom's spending limit stays with her main reviewer, whoever the category names", () => {
    const d = evaluatePurchase(rules, { amountCents: 5000, categories: ["video_games"] }, [], { now: NOW, shopperName: "Mom", reviewerName: "Sarah", ruleOwner: "shopper" });
    expect(d.reviewer).toBe("Sarah");
  });

  it("a block in Mom's own rules says so, instead of asking her reviewer to change them", () => {
    const d = evaluatePurchase(rules, { amountCents: 1000, categories: ["toys"] }, [], { now: NOW, shopperName: "Mom", reviewerName: "Sarah", ruleOwner: "shopper" });
    expect(d.reasons[0].message).toBe("Toy purchases of any amount aren't allowed under Mom's own rules.");
  });
});

describe("changeWords", () => {
  it("names a reviewer change as such, not as loosening", () => {
    const before: RuleSet = { categories: { general: { bands: [{ minCents: 0, maxCents: null, outcome: "review" }] } }, caps: [] };
    const after: RuleSet = { ...before, categories: { ...before.categories, video_games: { bands: [{ minCents: 0, maxCents: null, outcome: "review" }], reviewer: "Marcus" } } };
    expect(changeWords(summarizeChange(before, after))).toBe("changed who reviews Video Games & Accessories");
    expect(changeWords(summarizeChange(before, after), "ask")).toBe("change who reviews Video Games & Accessories");
  });
});

describe("gadgets some stores file elsewhere count as Electronics", () => {
  it.each([
    [["Apparel & Accessories", "Jewelry", "Smart Watches"]],
    [["Health & Beauty", "Health Care", "Biometric Monitors", "Activity Monitors"]],
    [["Electronics", "Computers", "Handheld Devices", "E-Book Readers"]],
  ])("%j", (path) => expect(categoryFromCatalog(path)).toBe("electronics"));

  it("a blood pressure monitor is still a medical device", () => {
    expect(categoryFromCatalog(["Health & Beauty", "Health Care", "Biometric Monitors", "Blood Pressure Monitors"])).toBe("medical_device");
  });
});
