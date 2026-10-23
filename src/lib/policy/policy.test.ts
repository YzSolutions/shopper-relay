import { describe, expect, it } from "vitest";
import { numberToCents, parseToCents } from "../money";
import {
  activeRules,
  approvePendingChange,
  checkPayPalAmount,
  evaluatePurchase,
  FAMILY_ELDER_RULES,
  findRuleIssues,
  PARENT_CHILD_RULES,
  PERSONAL_SHOPPER_RULES,
  requestRuleChange,
  resolveCategory,
  summarizeChange,
  type CategoryKey,
  type HistoryEntry,
  type RuleSet,
  type RulesState,
} from "./index";

const NOW = new Date("2026-11-01T12:00:00Z");
const hoursFrom = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);
const daysAgo = (d: number) => hoursFrom(NOW, -24 * d).toISOString();
const bought = (amountCents: number, categories: CategoryKey[], at = daysAgo(1)): HistoryEntry => ({
  at,
  categories,
  amountCents,
  status: "captured",
});

function judge(rules: RuleSet, amountCents: number, categories: CategoryKey[], history: HistoryEntry[] = []) {
  return evaluatePurchase(rules, { amountCents, categories }, history, { now: NOW, shopperName: "Mom", reviewerName: "Sarah" });
}

describe("money", () => {
  it("parses PayPal decimal strings without floats", () => {
    expect(parseToCents("179.00")).toBe(17900);
    expect(parseToCents("9.5")).toBe(950);
    expect(parseToCents("0.07")).toBe(7);
    expect(() => parseToCents("12.345")).toThrow();
  });

  it("converts catalog number prices once, rounding float noise", () => {
    expect(numberToCents(69.49)).toBe(6949);
    expect(numberToCents(14.6)).toBe(1460);
    expect(numberToCents(0.1 + 0.2)).toBe(30);
  });
});

describe("rule gaps", () => {
  it("finds the $75-$150 hole in 'under $75 I decide, over $150 Sarah decides'", () => {
    const rules: RuleSet = {
      categories: {
        general: {
          bands: [
            { minCents: 0, maxCents: 7500, outcome: "auto" },
            { minCents: 15000, maxCents: null, outcome: "review" },
          ],
        },
      },
      caps: [],
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "gap", category: "general", minCents: 7500, maxCents: 15000 }]);
    const d = judge(rules, 10000, ["general"]);
    expect(d.outcome).toBe("review");
    expect(d.reasons[0].code).toBe("undefined_range");
  });

  it("reports a missing general rule as a gap over everything", () => {
    expect(findRuleIssues({ categories: {}, caps: [] })).toEqual([
      { kind: "gap", category: "general", minCents: 0, maxCents: null },
    ]);
  });

  it("resolves conflicting bands to the stricter outcome and reports them", () => {
    const rules: RuleSet = {
      categories: {
        general: {
          bands: [
            { minCents: 0, maxCents: 10000, outcome: "auto" },
            { minCents: 5000, maxCents: null, outcome: "review" },
          ],
        },
      },
      caps: [],
    };
    expect(findRuleIssues(rules)).toEqual([{ kind: "conflict", category: "general", minCents: 5000, maxCents: 10000 }]);
    expect(judge(rules, 6000, ["general"]).outcome).toBe("review");
  });

  it("all three presets are complete", () => {
    expect(findRuleIssues(FAMILY_ELDER_RULES)).toEqual([]);
    expect(findRuleIssues(PARENT_CHILD_RULES)).toEqual([]);
    expect(findRuleIssues(PERSONAL_SHOPPER_RULES)).toEqual([]);
  });
});

describe("Mom + Sarah preset", () => {
  const mom = (amountCents: number, categories: CategoryKey[], history?: HistoryEntry[]) =>
    judge(FAMILY_ELDER_RULES, amountCents, categories, history).outcome;

  it("sends the $149 blood pressure monitor to Sarah, and says why", () => {
    const d = judge(FAMILY_ELDER_RULES, 14900, ["medical_device"]);
    expect(d.outcome).toBe("review");
    expect(d.reasons[0].message).toBe("Sarah takes a look at medical device purchases of $100.00 and up.");
  });

  it("lets Mom buy under each limit, and sends the limit itself to Sarah", () => {
    expect(mom(9999, ["medical_device"])).toBe("auto");
    expect(mom(10000, ["medical_device"])).toBe("review");
    expect(mom(7999, ["clothing"])).toBe("auto");
    expect(mom(8000, ["clothing"])).toBe("review");
    expect(mom(9999, ["food"])).toBe("auto");
    expect(mom(14999, ["medical_visit"])).toBe("auto");
    expect(mom(15000, ["medical_visit"])).toBe("review");
    expect(mom(7499, ["general"])).toBe("auto");
    expect(mom(7500, ["general"])).toBe("review");
  });

  it("falls back to General Shopping for categories without a rule", () => {
    expect(mom(7000, ["toys"])).toBe("auto");
    expect(mom(7500, ["toys"])).toBe("review");
  });

  it("always reviews subscriptions, even tiny ones", () => {
    expect(mom(100, ["subscription"])).toBe("review");
  });

  it("has no spending caps by default", () => {
    expect(mom(9000, ["medical_device"], [bought(9000, ["medical_device"])])).toBe("auto");
  });

  it("takes the strictest rule when several categories apply", () => {
    // $78 is under clothing's $80 but over general's $75.
    expect(mom(7800, ["clothing"])).toBe("auto");
    expect(mom(7800, ["clothing", "general"])).toBe("review");
  });

  it("reviews anything recurring even with no subscription rule at all", () => {
    const noSubRule: RuleSet = { categories: { general: FAMILY_ELDER_RULES.categories.general! }, caps: [] };
    expect(judge(noSubRule, 500, ["general", "subscription"]).outcome).toBe("review");
  });
});

describe("Kids + parents preset", () => {
  const kid = (amountCents: number, categories: CategoryKey[], history: HistoryEntry[] = []) =>
    evaluatePurchase(PARENT_CHILD_RULES, { amountCents, categories }, history, { now: NOW, shopperName: "Leo", reviewerName: "Dana" });

  it("needs the parent for every purchase, even within budget", () => {
    expect(kid(500, ["toys"]).outcome).toBe("review");
    expect(kid(1500, ["toys"]).outcome).toBe("review"); // "up to $15" includes $15
  });

  it("needs an exception over a category budget", () => {
    const d = kid(1501, ["toys"]);
    expect(d.outcome).toBe("exception");
    expect(d.reasons[0].message).toBe("Toy purchases over $15.00 are over the limit, so Dana must approve an exception.");
    expect(kid(6900, ["video_games"]).outcome).toBe("exception");
  });

  it("needs an exception when the weekly total would pass $30", () => {
    const history = [bought(1000, ["toys"]), bought(1500, ["books"])]; // $25 this week
    const d = kid(1500, ["toys"], history);
    expect(d.outcome).toBe("exception");
    expect(d.reasons[0].code).toBe("cap");
    expect(d.reasons[0].message).toContain("$40.00, over the $30.00 weekly limit");
    expect(kid(500, ["toys"], history).outcome).toBe("review"); // $30 exactly is fine
  });

  it("needs an exception when the 30-day total would pass $100, even across quiet weeks", () => {
    const history = [10, 17, 24].map((d) => bought(3000, ["clothing"], daysAgo(d))); // $90, none this week
    expect(kid(1500, ["toys"], history).outcome).toBe("exception");
    expect(kid(1000, ["toys"], history).outcome).toBe("review");
  });

  it("reserves budget for pending requests but not declined ones", () => {
    const pending: HistoryEntry = { ...bought(2500, ["toys"]), status: "pending_review" };
    const declined: HistoryEntry = { ...bought(2500, ["toys"]), status: "declined" };
    expect(kid(1000, ["books"], [pending]).outcome).toBe("exception");
    expect(kid(1000, ["books"], [declined]).outcome).toBe("review");
  });

  it("blocks subscriptions", () => {
    expect(kid(299, ["subscription"]).outcome).toBe("blocked");
    expect(kid(1000, ["video_games", "subscription"]).outcome).toBe("blocked");
  });
});

describe("Personal shopper preset", () => {
  const shop = (amountCents: number, categories: CategoryKey[]) =>
    evaluatePurchase(PERSONAL_SHOPPER_RULES, { amountCents, categories }, [], { now: NOW, shopperName: "Priya", reviewerName: "Marcus" });

  it("never lets the shopper buy alone: every find goes to the customer", () => {
    expect(shop(2000, ["shoes_handbags"]).outcome).toBe("review");
    expect(shop(8900, ["shoes_handbags"]).reviewer).toBe("Marcus");
  });

  it("flags finds over the customer's target budget", () => {
    expect(shop(15000, ["shoes_handbags"]).outcome).toBe("review"); // "up to $150"
    const d = shop(17900, ["shoes_handbags"]);
    expect(d.outcome).toBe("exception");
    expect(d.reasons[0].message).toBe("Shoe and handbag purchases over $150.00 are over the limit, so Marcus must approve an exception.");
  });

  it("needs the customer's consent for subscriptions", () => {
    expect(shop(500, ["subscription"]).outcome).toBe("review");
  });
});

describe("resolveCategory", () => {
  const bpPath = ["Health & Beauty", "Health Care", "Biometric Monitors", "Blood Pressure Monitors"];

  it("trusts the catalog over the AI", () => {
    const r = resolveCategory({ catalogPath: bpPath, ai: { category: "medical_device", confidence: 0.95 }, recurring: "no" });
    expect(r).toMatchObject({ categories: ["medical_device"], primary: "medical_device", basis: "catalog" });
  });

  it("maps real Channel3 paths", () => {
    const coat = ["Apparel & Accessories", "Clothing", "Outerwear", "Coats & Jackets"];
    expect(resolveCategory({ catalogPath: coat, recurring: "no" }).primary).toBe("clothing");
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
    expect(judge(FAMILY_ELDER_RULES, 7800, r.categories).outcome).toBe("review");
  });

  it("adds the subscription rule when recurring is yes or uncertain", () => {
    expect(resolveCategory({ catalogPath: bpPath, recurring: "uncertain" }).categories).toEqual(["medical_device", "subscription"]);
    expect(resolveCategory({ catalogPath: bpPath, recurring: "no" }).categories).toEqual(["medical_device"]);
  });
});

describe("rule changes", () => {
  const withMedicalLimit = (thresholdCents: number): RuleSet => ({
    ...FAMILY_ELDER_RULES,
    categories: {
      ...FAMILY_ELDER_RULES.categories,
      medical_device: {
        bands: [
          { minCents: 0, maxCents: thresholdCents, outcome: "auto" },
          { minCents: thresholdCents, maxCents: null, outcome: "review" },
        ],
      },
    },
  });
  // Mom owns her rules, Sarah reviews.
  const start: RulesState = { owner: "shopper", rules: withMedicalLimit(15000), pending: null };
  // Kids: the parent owns the rules and reviews.
  const kid: RulesState = { ...start, owner: "reviewer" };
  const outcomeFor = (s: RulesState, at: Date, amountCents = 30000) =>
    evaluatePurchase(activeRules(s, at), { amountCents, categories: ["medical_device"] }).outcome;
  const ok = (r: ReturnType<typeof requestRuleChange>) => {
    if (!r.ok) throw new Error(r.message);
    return r;
  };

  it("applies tightening immediately, whoever asks", () => {
    for (const [state, by] of [[start, "shopper"], [kid, "shopper"], [kid, "reviewer"]] as const) {
      const r = ok(requestRuleChange(state, withMedicalLimit(10000), by, NOW));
      expect(r.summary.kind).toBe("tighten");
      expect(r.notify).toBeNull();
      expect(outcomeFor(r.state, NOW, 12000)).toBe("review");
    }
  });

  it("holds Mom's loosening for 24 hours unless Sarah approves", () => {
    const { state, summary, notify } = ok(requestRuleChange(start, withMedicalLimit(50000), "shopper", NOW));
    expect(summary.kind).toBe("loosen");
    expect(notify).toBe("reviewer");
    expect(outcomeFor(state, hoursFrom(NOW, 23))).toBe("review");
    expect(outcomeFor(state, hoursFrom(NOW, 24))).toBe("auto"); // Sarah can't block it forever
    expect(outcomeFor(approvePendingChange(state, hoursFrom(NOW, 1)), hoursFrom(NOW, 1))).toBe("auto");
  });

  it("doesn't let Sarah loosen Mom's rules", () => {
    expect(requestRuleChange(start, withMedicalLimit(50000), "reviewer", NOW).ok).toBe(false);
  });

  it("applies a parent's loosening at once", () => {
    const { state } = ok(requestRuleChange(kid, withMedicalLimit(50000), "reviewer", NOW));
    expect(outcomeFor(state, NOW)).toBe("auto");
  });

  it("makes a child's loosening wait for the parent, with no time-out", () => {
    const { state, notify } = ok(requestRuleChange(kid, withMedicalLimit(50000), "shopper", NOW));
    expect(notify).toBe("reviewer");
    expect(outcomeFor(state, hoursFrom(NOW, 24 * 30))).toBe("review");
    expect(outcomeFor(approvePendingChange(state, NOW), NOW)).toBe("auto");
  });

  it("applies the tightening half of a mixed change now and the loosening half later", () => {
    const proposed: RuleSet = {
      ...withMedicalLimit(50000),
      categories: {
        ...withMedicalLimit(50000).categories,
        clothing: {
          bands: [
            { minCents: 0, maxCents: 5000, outcome: "auto" },
            { minCents: 5000, maxCents: null, outcome: "review" },
          ],
        },
      },
    };
    const { state, summary } = ok(requestRuleChange(start, proposed, "shopper", NOW));
    expect(summary.kind).toBe("mixed");
    const now = activeRules(state, hoursFrom(NOW, 1));
    expect(evaluatePurchase(now, { amountCents: 6000, categories: ["clothing"] }).outcome).toBe("review");
    expect(evaluatePurchase(now, { amountCents: 30000, categories: ["medical_device"] }).outcome).toBe("review");
  });

  it("treats softening an outcome as loosening (exception -> review, blocked -> review)", () => {
    const softer: RuleSet = {
      ...PARENT_CHILD_RULES,
      categories: { ...PARENT_CHILD_RULES.categories, subscription: { bands: [{ minCents: 0, maxCents: null, outcome: "review" }] } },
    };
    expect(summarizeChange(PARENT_CHILD_RULES, softer).kind).toBe("loosen");
  });

  it("treats removing or raising a cap as loosening, and adding or lowering one as tightening", () => {
    const [week, month] = PARENT_CHILD_RULES.caps;
    expect(summarizeChange(PARENT_CHILD_RULES, { ...PARENT_CHILD_RULES, caps: [month] }).kind).toBe("loosen");
    expect(summarizeChange(PARENT_CHILD_RULES, { ...PARENT_CHILD_RULES, caps: [{ ...week, limitCents: 5000 }, month] }).kind).toBe("loosen");
    expect(summarizeChange(PARENT_CHILD_RULES, { ...PARENT_CHILD_RULES, caps: [{ ...week, limitCents: 2000 }, month] }).kind).toBe("tighten");
    expect(summarizeChange(FAMILY_ELDER_RULES, { ...FAMILY_ELDER_RULES, caps: [week] }).kind).toBe("tighten");
  });

  it("keeps both old and new caps while a loosening waits", () => {
    const raised: RuleSet = { ...PERSONAL_SHOPPER_RULES, caps: PERSONAL_SHOPPER_RULES.caps.map((c) => ({ ...c, limitCents: c.limitCents * 2 })) };
    const owned: RulesState = { owner: "reviewer", rules: PERSONAL_SHOPPER_RULES, pending: null };
    const { state } = ok(requestRuleChange(owned, raised, "shopper", NOW));
    expect(evaluatePurchase(activeRules(state, NOW), { amountCents: 9000, categories: ["clothing"] }, [bought(20000, ["gifts"])], { now: NOW }).outcome).toBe("review");
  });

  it("treats deleting a category rule by what the fallback allows", () => {
    // Dropping the $80 clothing rule makes clothing fall back to general's $75: a tightening.
    const rest = { ...FAMILY_ELDER_RULES.categories };
    delete rest.clothing;
    expect(summarizeChange(FAMILY_ELDER_RULES, { ...FAMILY_ELDER_RULES, categories: rest }).kind).toBe("tighten");
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
