import { describe, expect, it } from "vitest";
import { modelNumberOf, normalizeChannel3 } from "./channel3";
import { compareFor } from "./compare";

// Shaped like real Channel3 search results (names are fictional).
const raw = (id: string, title: string, brand: string, offers: Array<[string, number, string?]>) => ({
  id,
  title,
  brands: [{ id: brand, name: brand }],
  images: [{ url: `https://img.example/${id}.jpg`, is_main_image: true }],
  category: {
    slug: "blood-pressure-monitors",
    title: "Blood Pressure Monitors",
    path: [
      { slug: "health-beauty", title: "Health & Beauty" },
      { slug: "health-care", title: "Health Care" },
      { slug: "blood-pressure-monitors", title: "Blood Pressure Monitors" },
    ],
  },
  offers: offers.map(([domain, price, availability = "InStock"]) => ({
    url: `https://buy.example/${id}/${domain}`,
    domain,
    price: { price, currency: "USD" },
    availability,
  })),
});

describe("normalizeChannel3", () => {
  it("converts prices to cents, sorts offers cheapest available first, keeps the taxonomy", () => {
    const p = normalizeChannel3(
      raw("a1", "Upper Arm Monitor (AX4410)", "Acme", [
        ["retailer-b.com", 101.19],
        ["retailer-c.com", 59.0, "OutOfStock"],
        ["retailer-a.com", 64.99],
      ]) as never,
    );
    expect(p.offers.map((o) => [o.merchant, o.priceCents, o.available])).toEqual([
      ["retailer-a.com", 6499, true],
      ["retailer-b.com", 10119, true],
      ["retailer-c.com", 5900, false],
    ]);
    expect(p.categoryPath).toEqual(["Health & Beauty", "Health Care", "Blood Pressure Monitors"]);
    expect(p.modelNumber).toBe("AX4410");
    expect(p.imageUrl).toBe("https://img.example/a1.jpg");
  });

  it("only trusts explicit model numbers", () => {
    expect(modelNumberOf({ title: "Monitor (Large Cuff)" })).toBeNull();
    expect(modelNumberOf({ title: "7 Series Wrist Monitor" })).toBeNull();
    expect(modelNumberOf({ title: "Monitor", structured_attributes: { "model-number": ["ax-4410"] } })).toBe("AX-4410");
  });
});

describe("compareFor", () => {
  const selected = normalizeChannel3(raw("a1", "Upper Arm Monitor (AX4410)", "Acme", [["retailer-a.com", 64.99], ["retailer-b.com", 101.19]]) as never);
  const sameModelElsewhere = normalizeChannel3(raw("a2", "Acme Upper Arm BP Monitor (AX4410)", "acme", [["retailer-d.com", 61.5]]) as never);
  const otherBrandSameCode = normalizeChannel3(raw("a3", "Monitor (AX4410)", "Other", [["retailer-e.com", 40]]) as never);
  const different = normalizeChannel3(raw("b1", "Wrist Monitor", "Acme", [["retailer-a.com", 39.99]]) as never);

  it("calls listings the same product only with catalog grouping or matching brand + model", () => {
    const c = compareFor(selected, [selected, sameModelElsewhere, otherBrandSameCode, different]);
    expect(c.sameProduct.map((s) => [s.offer.merchant, s.basis])).toEqual([
      ["retailer-d.com", "same_brand_and_model"],
      ["retailer-b.com", "same_catalog_product"],
    ]);
    expect(c.similar.map((p) => p.sourceId)).toEqual(["a3", "b1"]);
  });
});
