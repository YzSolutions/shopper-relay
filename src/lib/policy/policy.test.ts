import { describe, expect, it } from "vitest";
import { parseToCents } from "../money";
import { DEMO_RULES } from "./demo";
import {
  activeRules,
  approvePendingChange,
  checkPayPalAmount,
  evaluatePurchase,
  findRuleIssues,
  requestRuleChange,
  resolveCategory,
  summarizeChange,
  type HistoryEntry,
  type RuleSet,
  type RulesState,
} from "./index";

const NOW = new Date("2026-11-01T12:00:00Z");
const hoursFrom = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

describe("money", () => {
  it("parses PayPal decimal strings without floats", () => {
    expect(parseToCents("179.00")).toBe(17900);
    expect(parseToCents("9.5")).toBe(950);
    expect(parseToCents("0.07")).toBe(7);
    expect(() => parseToCents("12.345")).toThrow();
  });
});

describe("rule gaps", () => {
  it("finds the $75-$150 hole in 'under $75 I decide, over $150 Sarah decides'", () => {
    const rules: RuleSet = {
      categories: {
        general: {
          bands: [
            { minCents: 0, maxCents: 7500, approver: "shopper" },
            { minCents: 15000, maxCents: null, approver: "reviewer" },
          ],
          weeklyShopperLimitCents: null,
        },
      },
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "gap", category: "general", minCents: 7500, maxCents: 15000 }]);

    const decision = evaluatePurchase(rules, { amountCents: 10000, categories: ["general"] }, [], { now: NOW });
    expect(decision.approver).toBe("reviewer");
    expect(decision.reasons[0].code).toBe("undefined_range");
  });

  it("reports a missing general rule as a gap over everything", () => {
    expect(findRuleIssues({ categories: {} })).toEqual([
      { kind: "gap", category: "general", minCents: 0, maxCents: null },
    ]);
  });

  it("resolves conflicting bands to review and reports them", () => {
    const rules: RuleSet = {
      categories: {
        general: {
          bands: [
            { minCents: 0, maxCents: 10000, approver: "shopper" },
            { minCents: 5000, maxCents: null, approver: "reviewer" },
          ],
          weeklyShopperLimitCents: null,
        },
      },
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "conflict", category: "general", minCents: 5000, maxCents: 10000 }]);
    expect(evaluatePurchase(rules, { amountCents: 6000, categories: ["general"] }).approver).toBe("reviewer");
  });

  it("demo rules have no issues", () => {
    expect(findRuleIssues(DEMO_RULES)).toEqual([]);
  });
});

describe("evaluatePurchase", () => {
  const evalAt = (amountCents: number, categories: HistoryEntry["categories"], history: HistoryEntry[] = []) =>
    evaluatePurchase(DEMO_RULES, { amountCents, categories }, history, { now: NOW, reviewerName: "Sarah" });

  it("applies per-category thresholds at the boundary", () => {
    expect(evalAt(9999, ["medical_device"]).approver).toBe("shopper");
    expect(evalAt(10000, ["medical_device"]).approver).toBe("reviewer");
    expect(evalAt(7999, ["clothing"]).approver).toBe("shopper");
    expect(evalAt(8000, ["clothing"]).approver).toBe("reviewer");
  });

  it("explains a $149 medical device going to Sarah", () => {
    const d = evalAt(14900, ["medical_device"]);
    expect(d.approver).toBe("reviewer");
    expect(d.reasons[0].message).toBe("Medical Device purchases of $100.00 and up go to Sarah for review.");
  });

  it("falls back to General Shopping for categories without a rule", () => {
    expect(evalAt(7000, ["food"]).approver).toBe("shopper");
    expect(evalAt(7500, ["food"]).approver).toBe("reviewer");
  });

  it("takes the strictest rule when several categories apply", () => {
    // $78 is under clothing's $80 but over general's $75.
    expect(evalAt(7800, ["clothing"]).approver).toBe("shopper");
    expect(evalAt(7800, ["clothing", "general"]).approver).toBe("reviewer");
  });

  it("sends anything recurring to review, even with no subscription rule", () => {
    const noSubRule: RuleSet = { categories: { general: DEMO_RULES.categories.general! } };
    const d = evaluatePurchase(noSubRule, { amountCents: 500, categories: ["general", "subscription"] });
    expect(d.approver).toBe("reviewer");
  });

  it("stops two $70 purchases from slipping under a $100 weekly limit", () => {
    const history: HistoryEntry[] = [
      { at: hoursFrom(NOW, -48).toISOString(), categories: ["medical_device"], amountCents: 7000, status: "captured" },
    ];
    const d = evalAt(7000, ["medical_device"], history);
    expect(d.approver).toBe("reviewer");
    expect(d.reasons[0].code).toBe("weekly_limit");
  });

  it("counts pending purchases toward the weekly limit but not voided or old ones", () => {
    const at = (h: number) => hoursFrom(NOW, h).toISOString();
    expect(evalAt(7000, ["medical_device"], [{ at: at(-1), categories: ["medical_device"], amountCents: 7000, status: "pending_review" }]).approver).toBe("reviewer");
    expect(evalAt(7000, ["medical_device"], [{ at: at(-1), categories: ["medical_device"], amountCents: 7000, status: "voided" }]).approver).toBe("shopper");
    expect(evalAt(7000, ["medical_device"], [{ at: at(-24 * 8), categories: ["medical_device"], amountCents: 7000, status: "captured" }]).approver).toBe("shopper");
  });
});

describe("resolveCategory", () => {
  const bpPath = ["Health & Beauty", "Health Care", "Biometric Monitors", "Blood Pressure Monitors"];

  it("trusts the catalog over the AI", () => {
    const r = resolveCategory({ catalogPath: bpPath, ai: { category: "medical_device", confidence: 0.95 }, recurring: "no" });
    expect(r).toMatchObject({ categories: ["medical_device"], primary: "medical_device", basis: "catalog" });
  });

  it("applies both rules when catalog and a confident AI disagree", () => {
    const r = resolveCategory({ catalogPath: bpPath, ai: { category: "general", confidence: 0.9 }, recurring: "no" });
    expect(r.basis).toBe("ambiguous");
    expect(r.categories.sort()).toEqual(["general", "medical_device"]);
  });

  it("does not let a low-confidence AI pick a looser category", () => {
    const r = resolveCategory({ catalogPath: null, ai: { category: "clothing", confidence: 0.5 }, recurring: "no" });
    expect(r.basis).toBe("ambiguous");
    expect(r.categories).toEqual(["clothing", "general"]);
    // $78 is under clothing's $80 but over general's $75, so it goes to review.
    expect(evaluatePurchase(DEMO_RULES, { amountCents: 7800, categories: r.categories }).approver).toBe("reviewer");
  });

  it("adds the subscription rule when recurring is yes or uncertain", () => {
    expect(resolveCategory({ catalogPath: bpPath, recurring: "uncertain" }).categories).toEqual(["medical_device", "subscription"]);
    expect(resolveCategory({ catalogPath: bpPath, recurring: "no" }).categories).toEqual(["medical_device"]);
  });
});

describe("rule changes", () => {
  const withMedicalLimit = (maxCents: number): RuleSet => ({
    categories: {
      ...DEMO_RULES.categories,
      medical_device: {
        bands: [
          { minCents: 0, maxCents, approver: "shopper" },
          { minCents: maxCents, maxCents: null, approver: "reviewer" },
        ],
        weeklyShopperLimitCents: null,
      },
    },
  });
  // Elderly parent: Mom owns her rules, Sarah reviews.
  const start: RulesState = { owner: "shopper", rules: withMedicalLimit(15000), pending: null };
  // Kids: the parent owns the rules and reviews.
  const kid: RulesState = { ...start, owner: "reviewer" };
  const approverFor = (s: RulesState, at: Date, amountCents = 30000) =>
    evaluatePurchase(activeRules(s, at), { amountCents, categories: ["medical_device"] }).approver;
  const ok = (r: ReturnType<typeof requestRuleChange>) => {
    if (!r.ok) throw new Error(r.message);
    return r;
  };

  it("applies tightening immediately, whoever asks", () => {
    for (const [state, by] of [[start, "shopper"], [kid, "shopper"], [kid, "reviewer"]] as const) {
      const r = ok(requestRuleChange(state, withMedicalLimit(10000), by, NOW));
      expect(r.summary.kind).toBe("tighten");
      expect(r.notify).toBeNull();
      expect(approverFor(r.state, NOW, 12000)).toBe("reviewer");
    }
  });

  it("holds Mom's loosening for 24 hours unless Sarah approves", () => {
    const { state, summary, notify } = ok(requestRuleChange(start, withMedicalLimit(50000), "shopper", NOW));
    expect(summary.kind).toBe("loosen");
    expect(notify).toBe("reviewer");

    expect(approverFor(state, hoursFrom(NOW, 23))).toBe("reviewer");
    expect(approverFor(state, hoursFrom(NOW, 24))).toBe("shopper"); // Sarah can't block it forever
    expect(approverFor(approvePendingChange(state, hoursFrom(NOW, 1)), hoursFrom(NOW, 1))).toBe("shopper");
  });

  it("doesn't let Sarah loosen Mom's rules", () => {
    expect(requestRuleChange(start, withMedicalLimit(50000), "reviewer", NOW).ok).toBe(false);
  });

  it("applies a parent's loosening at once", () => {
    const { state } = ok(requestRuleChange(kid, withMedicalLimit(50000), "reviewer", NOW));
    expect(approverFor(state, NOW)).toBe("shopper");
  });

  it("makes a child's loosening wait for the parent, with no time-out", () => {
    const { state, notify } = ok(requestRuleChange(kid, withMedicalLimit(50000), "shopper", NOW));
    expect(notify).toBe("reviewer");
    expect(approverFor(state, hoursFrom(NOW, 24 * 30))).toBe("reviewer");
    expect(approverFor(approvePendingChange(state, NOW), NOW)).toBe("shopper");
  });

  it("applies the tightening half of a mixed change now and the loosening half later", () => {
    const proposed: RuleSet = {
      categories: {
        ...withMedicalLimit(50000).categories,
        clothing: {
          bands: [
            { minCents: 0, maxCents: 5000, approver: "shopper" },
            { minCents: 5000, maxCents: null, approver: "reviewer" },
          ],
          weeklyShopperLimitCents: null,
        },
      },
    };
    const { state, summary } = ok(requestRuleChange(start, proposed, "shopper", NOW));
    expect(summary.kind).toBe("mixed");
    const now = activeRules(state, hoursFrom(NOW, 1));
    expect(evaluatePurchase(now, { amountCents: 6000, categories: ["clothing"] }).approver).toBe("reviewer");
    expect(evaluatePurchase(now, { amountCents: 30000, categories: ["medical_device"] }).approver).toBe("reviewer");
  });

  it("treats removing a weekly limit as loosening", () => {
    const noLimit: RuleSet = {
      categories: { ...DEMO_RULES.categories, medical_device: { ...DEMO_RULES.categories.medical_device!, weeklyShopperLimitCents: null } },
    };
    expect(summarizeChange(DEMO_RULES, noLimit).kind).toBe("loosen");
  });

  it("treats deleting a category rule by what the fallback allows", () => {
    // Dropping the $80 clothing rule makes clothing fall back to general's $75: a tightening.
    const { clothing: _, ...rest } = DEMO_RULES.categories;
    expect(summarizeChange(DEMO_RULES, { categories: rest }).kind).toBe("tighten");
  });
});

describe("checkPayPalAmount", () => {
  it("passes an exact match", () => {
    expect(checkPayPalAmount(14900, { value: "149.00", currency_code: "USD" })).toEqual({ ok: true, paypalCents: 14900 });
  });

  it("stops when PayPal holds a different amount than was reviewed", () => {
    const r = checkPayPalAmount(14900, { value: "179.00", currency_code: "USD" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("$179.00");
  });

  it("stops on a currency mismatch", () => {
    expect(checkPayPalAmount(14900, { value: "149.00", currency_code: "CAD" }).ok).toBe(false);
  });
});
