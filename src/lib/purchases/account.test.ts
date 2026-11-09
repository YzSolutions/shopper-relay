import { describe, expect, it } from "vitest";
import { accountHolder, boughtFor, payerOf, statement, type AccountHousehold } from "./account";

const mom: AccountHousehold = { relationship: "family_elder", shopperName: "Mom", reviewerName: "Sarah" };
const leo: AccountHousehold = { relationship: "parent_child", shopperName: "Leo", reviewerName: "Sarah" };
const priya: AccountHousehold = { relationship: "personal_shopper", shopperName: "Priya", reviewerName: "Marcus" };
const ai: AccountHousehold = { relationship: "ai_shopper", shopperName: "AI Shopper", reviewerName: "Sarah" };
const sarah: AccountHousehold = { relationship: "self", shopperName: "Sarah", reviewerName: "Sarah" };

const asked = (reviewerName: string | null = null) => ({ reviewerName, standing: false });

describe("whose PayPal a purchase charges", () => {
  it("is the shopper's own where the shopper pays", () => {
    expect(payerOf(mom, asked("Sarah"))).toBe("Mom");
    expect(payerOf(sarah, asked())).toBe("Sarah");
  });

  it("is whoever approves and pays in a request", () => {
    expect(payerOf(leo, asked())).toBe("Sarah");
    expect(payerOf(leo, asked("Marcus"))).toBe("Marcus");
    expect(payerOf(priya, asked("Marcus"))).toBe("Marcus");
  });

  it("is the saved PayPal's owner when bought with standing permission", () => {
    expect(payerOf(ai, { reviewerName: "Sarah", standing: true })).toBe("Sarah");
    expect(payerOf(leo, { reviewerName: "Marcus", standing: true })).toBe("Sarah");
  });

  it("names each tab's account holder and who its buying is for", () => {
    expect([mom, leo, priya, ai, sarah].map(accountHolder)).toEqual(["Mom", "Sarah", "Marcus", "Sarah", "Sarah"]);
    expect([mom, leo, priya, ai, sarah].map(boughtFor)).toEqual(["Mom", "Leo", "Marcus", "Sarah", "Sarah"]);
  });
});

describe("one person's PayPal table", () => {
  const entries = [
    { id: "mom's monitor", household: mom, purchase: asked("Sarah") },
    { id: "leo's hoodie", household: leo, purchase: asked() },
    { id: "leo's laptop", household: leo, purchase: asked("Marcus") },
    { id: "the jacket", household: priya, purchase: asked("Marcus") },
    { id: "the clock", household: ai, purchase: { reviewerName: "Sarah", standing: true } },
    { id: "the bed set", household: sarah, purchase: asked() },
  ];

  it("has what charges Sarah, from every relationship, and nothing else", () => {
    expect(statement(entries, "Sarah").map((e) => e.id)).toEqual(["leo's hoodie", "the clock", "the bed set"]);
  });

  it("gives Marcus his own: the jacket and Leo's laptop", () => {
    expect(statement(entries, "Marcus").map((e) => e.id)).toEqual(["leo's laptop", "the jacket"]);
  });

  it("keeps Mom's own spending to Mom", () => {
    expect(statement(entries, "Mom").map((e) => e.id)).toEqual(["mom's monitor"]);
  });
});
