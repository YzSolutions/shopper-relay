import { describe, expect, it } from "vitest";
import { anonymizeProduct, storeAlias, stripBrand } from "./anonymize";
import type { Product } from "./types";

const product: Product = {
  source: "channel3",
  sourceId: "p1",
  title: "OMRON® 3 Series Upper Arm Blood Pressure Monitor",
  brand: "OMRON",
  modelNumber: null,
  description: "Omron's best-selling monitor.",
  imageUrl: "https://img.example/p1.jpg",
  categoryPath: ["Health & Beauty"],
  keyFeatures: ["Made by Omron"],
  attributes: {},
  offers: [
    { merchant: "bestbuy.com", url: "https://buy.example/1", priceCents: 3699, compareAtCents: null, currency: "USD", available: true, condition: "new" },
    { merchant: "walgreens.com", url: "https://buy.example/2", priceCents: 3999, compareAtCents: null, currency: "USD", available: true, condition: "new" },
  ],
};

describe("demo anonymizing", () => {
  it("gives each store a stable invented name", () => {
    expect(storeAlias("bestbuy.com")).toBe(storeAlias("BestBuy.com"));
    expect(storeAlias("bestbuy.com")).not.toContain("best");
  });

  it("removes the brand and trademark symbols from titles", () => {
    expect(stripBrand(product.title, product.brand)).toBe("3 Series Upper Arm Blood Pressure Monitor");
  });

  it("hides brand, store names, links and flags the photo", () => {
    const a = anonymizeProduct(product);
    expect(a.brand).toBeNull();
    expect(JSON.stringify(a).toLowerCase()).not.toMatch(/omron|bestbuy|walgreens/);
    expect(a.offers.map((o) => o.priceCents)).toEqual([3699, 3999]);
    expect(a.imageHidden).toBe(true);
  });
});
