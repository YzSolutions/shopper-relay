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
            { minCents: 0, maxCents: 7500, approver: "self" },
            { minCents: 15000, maxCents: null, approver: "trusted_contact" },
          ],
          weeklySelfLimitCents: null,
        },
      },
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "gap", category: "general", minCents: 7500, maxCents: 15000 }]);

    const decision = evaluatePurchase(rules, { amountCents: 10000, categories: ["general"] }, [], { now: NOW });
    expect(decision.approver).toBe("trusted_contact");
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
            { minCents: 0, maxCents: 10000, approver: "self" },
            { minCents: 5000, maxCents: null, approver: "trusted_contact" },
          ],
          weeklySelfLimitCents: null,
        },
      },
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "conflict", category: "general", minCents: 5000, maxCents: 10000 }]);
    expect(evaluatePurchase(rules, { amountCents: 6000, categories: ["general"] }).approver).toBe("trusted_contact");
  });

  it("demo rules have no issues", () => {
    expect(findRuleIssues(DEMO_RULES)).toEqual([]);
  });
});

describe("evaluatePurchase", () => {
  const evalAt = (amountCents: number, categories: HistoryEntry["categories"], history: HistoryEntry[] = []) =>
    evaluatePurchase(DEMO_RULES, { amountCents, categories }, history, { now: NOW, contactName: "Sarah" });

  it("applies per-category thresholds at the boundary", () => {
    expect(evalAt(9999, ["medical_device"]).approver).toBe("self");
    expect(evalAt(10000, ["medical_device"]).approver).toBe("trusted_contact");
    expect(evalAt(7999, ["clothing"]).approver).toBe("self");
    expect(evalAt(8000, ["clothing"]).approver).toBe("trusted_contact");
  });

  it("explains a $149 medical device going to Sarah", () => {
    const d = evalAt(14900, ["medical_device"]);
    expect(d.approver).toBe("trusted_contact");
    expect(d.reasons[0].message).toBe("Medical Device purchases of $100.00 and up go to Sarah for review.");
  });

  it("falls back to General Shopping for categories without a rule", () => {
    expect(evalAt(7000, ["food"]).approver).toBe("self");
    expect(evalAt(7500, ["food"]).approver).toBe("trusted_contact");
  });

  it("takes the strictest rule when several categories apply", () => {
    // $78 is under clothing's $80 but over general's $75.
    expect(evalAt(7800, ["clothing"]).approver).toBe("self");
    expect(evalAt(7800, ["clothing", "general"]).approver).toBe("trusted_contact");
  });

  it("sends anything recurring to review, even with no subscription rule", () => {
    const noSubRule: RuleSet = { categories: { general: DEMO_RULES.categories.general! } };
    const d = evaluatePurchase(noSubRule, { amountCents: 500, categories: ["general", "subscription"] });
    expect(d.approver).toBe("trusted_contact");
  });

  it("stops two $70 purchases from slipping under a $100 weekly limit", () => {
    const history: HistoryEntry[] = [
      { at: hoursFrom(NOW, -48).toISOString(), categories: ["medical_device"], amountCents: 7000, status: "captured" },
    ];
    const d = evalAt(7000, ["medical_device"], history);
    expect(d.approver).toBe("trusted_contact");
    expect(d.reasons[0].code).toBe("weekly_limit");
  });

  it("counts pending purchases toward the weekly limit but not voided or old ones", () => {
    const at = (h: number) => hoursFrom(NOW, h).toISOString();
    expect(evalAt(7000, ["medical_device"], [{ at: at(-1), categories: ["medical_device"], amountCents: 7000, status: "pending_review" }]).approver).toBe("trusted_contact");
    expect(evalAt(7000, ["medical_device"], [{ at: at(-1), categories: ["medical_device"], amountCents: 7000, status: "voided" }]).approver).toBe("self");
    expect(evalAt(7000, ["medical_device"], [{ at: at(-24 * 8), categories: ["medical_device"], amountCents: 7000, status: "captured" }]).approver).toBe("self");
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
    expect(evaluatePurchase(DEMO_RULES, { amountCents: 7800, categories: r.categories }).approver).toBe("trusted_contact");
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
          { minCents: 0, maxCents, approver: "self" },
          { minCents: maxCents, maxCents: null, approver: "trusted_contact" },
        ],
        weeklySelfLimitCents: null,
      },
    },
  });
  const start: RulesState = { rules: withMedicalLimit(15000), pending: null };

  it("applies tightening immediately", () => {
    const { state, summary, notifyContact } = requestRuleChange(start, withMedicalLimit(10000), NOW);
    expect(summary.kind).toBe("tighten");
    expect(notifyContact).toBe(false);
    expect(state.pending).toBeNull();
    expect(evaluatePurchase(activeRules(state, NOW), { amountCents: 12000, categories: ["medical_device"] }).approver).toBe("trusted_contact");
  });

  it("holds a loosening for 24 hours unless Sarah approves", () => {
    const { state, summary, notifyContact } = requestRuleChange(start, withMedicalLimit(50000), NOW);
    expect(summary.kind).toBe("loosen");
    expect(notifyContact).toBe(true);
    const check = (s: RulesState, at: Date) =>
      evaluatePurchase(activeRules(s, at), { amountCents: 30000, categories: ["medical_device"] }).approver;

    expect(check(state, hoursFrom(NOW, 23))).toBe("trusted_contact");
    expect(check(state, hoursFrom(NOW, 24))).toBe("self"); // Sarah can't block it forever
    expect(check(approvePendingChange(state, hoursFrom(NOW, 1)), hoursFrom(NOW, 1))).toBe("self");
  });

  it("applies the tightening half of a mixed change now and the loosening half later", () => {
    const proposed: RuleSet = {
      categories: {
        ...withMedicalLimit(50000).categories,
        clothing: {
          bands: [
            { minCents: 0, maxCents: 5000, approver: "self" },
            { minCents: 5000, maxCents: null, approver: "trusted_contact" },
          ],
          weeklySelfLimitCents: null,
        },
      },
    };
    const { state, summary } = requestRuleChange(start, proposed, NOW);
    expect(summary.kind).toBe("mixed");
    const now = activeRules(state, hoursFrom(NOW, 1));
    expect(evaluatePurchase(now, { amountCents: 6000, categories: ["clothing"] }).approver).toBe("trusted_contact");
    expect(evaluatePurchase(now, { amountCents: 30000, categories: ["medical_device"] }).approver).toBe("trusted_contact");
  });

  it("treats removing a weekly limit as loosening", () => {
    const noLimit: RuleSet = {
      categories: { ...DEMO_RULES.categories, medical_device: { ...DEMO_RULES.categories.medical_device!, weeklySelfLimitCents: null } },
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
