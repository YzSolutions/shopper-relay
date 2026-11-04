import { describe, expect, it } from "vitest";
import type { Outcome, RuleSet } from "@/lib/policy/types";
import { ruleDiff } from "./describe";

const band = (minCents: number, maxCents: number | null, outcome: Outcome) => ({ minCents, maxCents, outcome });

const before: RuleSet = {
  categories: {
    general: { bands: [band(0, 7500, "auto"), band(7500, null, "review")] },
    clothing: { bands: [band(0, 8000, "auto"), band(8000, null, "review")] },
  },
  caps: [],
};

describe("ruleDiff", () => {
  it("lists only the categories that changed, before and after", () => {
    const after: RuleSet = { ...before, categories: { ...before.categories, clothing: { bands: [band(0, 10000, "auto"), band(10000, null, "review")] } } };
    expect(ruleDiff(before, after, "Sarah")).toEqual([
      {
        label: "Clothing",
        before: "Under $80.00: you buy on your own. $80.00 and up: Sarah takes a look.",
        after: "Under $100.00: you buy on your own. $100.00 and up: Sarah takes a look.",
      },
    ]);
  });

  it("says when a category gains or loses a rule of its own", () => {
    const after: RuleSet = { categories: { general: before.categories.general, toys: { bands: [band(0, null, "review")] } }, caps: [] };
    expect(ruleDiff(before, after, "Sarah").map((l) => [l.label, l.before, l.after])).toEqual([
      ["Clothing", "Under $80.00: you buy on your own. $80.00 and up: Sarah takes a look.", "No rule of its own. General Shopping applies."],
      ["Toys", "No rule of its own. General Shopping applies.", "Any amount: Sarah takes a look."],
    ]);
  });

  it("reports added and removed spending limits", () => {
    const after: RuleSet = { ...before, caps: [{ category: null, period: "week", limitCents: 3000, over: "exception" }] };
    expect(ruleDiff(before, after, "Sarah", "request")).toEqual([
      { label: "Spending limits", before: "None.", after: "All shopping combined: up to $30.00 in any 7 days. Over that, Sarah must approve an exception." },
    ]);
  });

  it("names the shopper when it's worded for the reviewer's phone", () => {
    const after: RuleSet = { ...before, categories: { ...before.categories, clothing: { bands: [band(0, null, "auto")] } } };
    expect(ruleDiff(before, after, "Sarah", "hold", "Mom")[0].after).toBe("Any amount: Mom buys without asking.");
  });

  it("finds nothing when nothing changed", () => {
    expect(ruleDiff(before, structuredClone(before), "Sarah")).toEqual([]);
  });
});
