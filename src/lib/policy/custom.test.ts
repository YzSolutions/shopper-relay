import { describe, expect, it } from "vitest";
import {
  activeRules,
  evaluatePurchase,
  FAMILY_ELDER_RULES,
  requestRuleChange,
  resolveCategory,
  RuleSetSchema,
  summarizeChange,
  type RuleSet,
  type RulesState,
} from "./index";

const NOW = new Date("2026-11-01T12:00:00Z");
const names = { now: NOW, shopperName: "Mom", reviewerName: "Sarah" };

const withCars: RuleSet = {
  ...FAMILY_ELDER_RULES,
  categories: {
    ...FAMILY_ELDER_RULES.categories,
    "custom:Cars": {
      bands: [
        { minCents: 0, maxCents: 1_000_000, outcome: "auto" },
        { minCents: 1_000_000, maxCents: null, outcome: "review" },
      ],
    },
  },
  custom: { "custom:Cars": { match: ["car", "vehicle", "automobile"] } },
};

describe("custom categories", () => {
  it("validates as a rule set", () => {
    expect(RuleSetSchema.safeParse(withCars).success).toBe(true);
    expect(RuleSetSchema.safeParse({ ...withCars, categories: { boats: { bands: [] } } }).success).toBe(false);
  });

  it("counts a product as Cars when the store files it there", () => {
    const r = resolveCategory({ catalogPath: ["Vehicles & Parts", "Vehicles", "Motor Vehicles", "Cars"], title: "2019 Sedan", custom: withCars.custom, recurring: "no" });
    expect(r).toMatchObject({ categories: ["custom:Cars"], primary: "custom:Cars", basis: "custom" });
    expect(evaluatePurchase(withCars, { amountCents: 900_000, categories: r.categories }, [], names).outcome).toBe("auto");
  });

  it("only adds the Cars rule when just the title mentions it, so the stricter rule wins", () => {
    const r = resolveCategory({ catalogPath: ["Electronics", "Phone Accessories"], title: "Car phone mount", custom: withCars.custom, recurring: "no" });
    expect(r.primary).toBe("electronics");
    expect(r.categories).toEqual(["electronics", "custom:Cars"]);
    // $90: fine under Cars, but over general's $75, so Sarah looks.
    expect(evaluatePurchase(withCars, { amountCents: 9000, categories: r.categories }, [], names).outcome).toBe("review");
  });

  it("matches whole words and plurals only", () => {
    expect(resolveCategory({ catalogPath: ["Home"], title: "Cars toy set", custom: withCars.custom, recurring: "no" }).categories).toContain("custom:Cars");
    expect(resolveCategory({ catalogPath: ["Home"], title: "Cardigan sweater", custom: withCars.custom, recurring: "no" }).categories).not.toContain("custom:Cars");
  });

  it("explains custom categories in plain words", () => {
    const d = evaluatePurchase(withCars, { amountCents: 1_200_000, categories: ["custom:Cars"] }, [], names);
    expect(d.reasons[0].message).toBe("Sarah takes a look at purchases in Cars of $10,000.00 and up.");
  });

  it("treats adding a looser custom category as loosening", () => {
    expect(summarizeChange(FAMILY_ELDER_RULES, withCars).kind).toBe("loosen");
  });
});

describe("a rule about one exact thing", () => {
  const custom: RuleSet["custom"] = { "custom:DDR5 RAM": { match: ["ddr5", "ram"], all: ["ddr5"], not: ["laptop", "computer"] } };
  const at = (title: string) => resolveCategory({ catalogPath: ["Electronics", "Computers"], title, custom, recurring: "no" });

  it("settles the category when the title has its exact words", () => {
    expect(at("Vengeance 16GB DDR5 UDIMM").categories).toEqual(["custom:DDR5 RAM"]);
  });

  it("doesn't open up things that only contain that part", () => {
    expect(at("Gaming Laptop 16GB DDR5").categories).toContain("electronics");
    expect(at("USB Flash Drive").categories).toEqual(["electronics"]);
  });

  it("without exact words, a title mention still only adds a rule, so the stricter one wins", () => {
    const plain: RuleSet["custom"] = { "custom:Cars": { match: ["car"] } };
    expect(resolveCategory({ catalogPath: ["Electronics"], title: "Car phone mount", custom: plain, recurring: "no" }).categories).toEqual(["electronics", "custom:Cars"]);
  });

  it("keeps the exact words through validation", () => {
    expect(RuleSetSchema.parse({ categories: {}, caps: [], custom }).custom).toEqual(custom);
  });
});

describe("a reviewer for one category", () => {
  const withMarcus: RuleSet = {
    ...FAMILY_ELDER_RULES,
    categories: { ...FAMILY_ELDER_RULES.categories, video_games: { ...FAMILY_ELDER_RULES.categories.general!, reviewer: "Marcus" } },
  };

  it("asks Marcus about video games and Sarah about everything else", () => {
    const games = evaluatePurchase(withMarcus, { amountCents: 9000, categories: ["video_games"] }, [], names);
    expect(games).toMatchObject({ outcome: "review", reviewer: "Marcus" });
    expect(games.reasons[0].message).toBe("Marcus takes a look at video game purchases of $75.00 and up.");
    expect(evaluatePurchase(withMarcus, { amountCents: 9000, categories: ["clothing"] }, [], names).reviewer).toBe("Sarah");
  });

  it("falls back to the main reviewer when reasons name different people", () => {
    const d = evaluatePurchase(withMarcus, { amountCents: 9000, categories: ["video_games", "subscription"] }, [], names);
    expect(d.reviewer).toBe("Sarah");
  });

  it("treats a new reviewer as loosening, so it waits 24 hours or for Sarah", () => {
    expect(summarizeChange(FAMILY_ELDER_RULES, withMarcus).kind).toBe("loosen");
    const state: RulesState = { owner: "shopper", rules: FAMILY_ELDER_RULES, pending: null };
    const r = requestRuleChange(state, withMarcus, "shopper", NOW);
    if (!r.ok) throw new Error(r.message);
    expect(r.notify).toBe("reviewer");
    // While it waits, Sarah still reviews video games.
    expect(evaluatePurchase(activeRules(r.state, NOW), { amountCents: 9000, categories: ["video_games"] }, [], names).reviewer).toBe("Sarah");
    expect(evaluatePurchase(activeRules(r.state, new Date(NOW.getTime() + 25 * 3600_000)), { amountCents: 9000, categories: ["video_games"] }, [], names).reviewer).toBe("Marcus");
  });
});
