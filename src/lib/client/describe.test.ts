import { describe, expect, it } from "vitest";
import type { Outcome, RuleSet } from "@/lib/policy/types";
import { capWords, phoneName, phoneSpecs, ruleDiff, whyWords } from "./describe";

const band = (minCents: number, maxCents: number | null, outcome: Outcome) => ({ minCents, maxCents, outcome });

const before: RuleSet = {
  categories: {
    general: { bands: [band(0, 7500, "auto"), band(7500, null, "review")] },
    clothing: { bands: [band(0, 8000, "auto"), band(8000, null, "review")] },
  },
  caps: [],
};

describe("the reviewer's short message", () => {
  it("names the maker and model once, unless hidden for filming", () => {
    expect(phoneName({ title: "Student Laptop", brand: "Acme", modelNumber: "X200" })).toBe("Acme Student Laptop X200");
    expect(phoneName({ title: "Acme X200 Student Laptop", brand: "Acme", modelNumber: "X200" })).toBe("Acme X200 Student Laptop");
    expect(phoneName({ title: "Student Laptop", brand: null, modelNumber: "X200", imageHidden: true })).toBe("Student Laptop");
  });

  it("keeps three short specs and drops the rest", () => {
    expect(phoneSpecs(["8GB memory", "This remarkably thin and light design goes anywhere", "256GB storage", "Built by the maker", "15.6 inch screen", "Webcam"])).toEqual(["8GB memory", "256GB storage", "15.6 inch screen"]);
    expect(phoneSpecs(undefined)).toEqual([]);
  });

  it("puts the processor first, however long the line is", () => {
    const listing = ["2-Year Warranty and 90-Day Hassle-Free Returns", "16GB RAM", "512GB PCIe SSD", "13th Gen Intel Alder Lake-N150 processor at 3.6GHz", "4 cores and 4 threads"];
    expect(phoneSpecs(listing)).toEqual(["13th Gen Intel Alder Lake-N150 processor at 3.6GHz", "16GB RAM", "512GB PCIe SSD"]);
    expect(phoneSpecs(["4GB RAM", "Intel Pentium Silver N5030", "Intel UHD Graphics"])[0]).toBe("Processor: Intel Pentium Silver N5030");
  });

  it("takes chip makers' names out for filming", () => {
    expect(phoneSpecs(["13th Gen Intel Alder Lake-N150 processor at 3.6GHz"], true)).toEqual(["13th Gen N150 processor at 3.6GHz"]);
    expect(phoneSpecs(["Intel Pentium Silver N5030", "4 cores"], true)).toEqual(["Processor: Silver N5030", "4 cores"]);
  });

  it("says over budget and the category, in a request", () => {
    expect(whyWords({ outcome: "exception", reasons: [{ category: "electronics" }, { category: null }] }, "electronics", "request", "Leo")).toEqual(["Over budget: Electronics"]);
    expect(whyWords({ outcome: "review", reasons: [{ category: "books" }] }, "books", "request", "Leo")).toEqual(["Books"]);
  });

  it("names the limit in a hold, leaving a repeat charge to its own line", () => {
    expect(whyWords({ outcome: "review", reasons: [{ category: "medical_device" }, { category: "subscription" }] }, "medical_device", "hold", "Mom")).toEqual(["Over Mom's limit: Medical Devices"]);
    expect(whyWords({ outcome: "review", reasons: [{ category: "subscription" }] }, "general", "hold", "Mom")).toEqual([]);
  });
});

describe("who a spending limit goes to", () => {
  const cap = { category: null, period: "month", limitCents: 10000, over: "exception" } as const;
  const rules = { categories: { general: { bands: [] }, electronics: { bands: [], reviewer: "Marcus" } }, caps: [cap] };

  it("names everyone who decides, where someone reviews a category", () => {
    expect(capWords(cap, "Sarah", "request", rules)).toBe("All shopping combined: up to $100.00 in any 30 days. Over that, Sarah or Marcus, whoever decides on it, must approve an exception.");
  });

  it("names the category's own reviewer for that category's limit", () => {
    expect(capWords({ ...cap, category: "electronics" }, "Sarah", "request", rules)).toContain("Over that, Marcus must approve an exception.");
  });

  it("stays with the main reviewer where the shopper owns the rules", () => {
    expect(capWords(cap, "Sarah", "hold", rules)).toContain("Over that, Sarah must approve an exception.");
  });
});

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
