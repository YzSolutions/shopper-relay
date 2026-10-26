import { describe, expect, it } from "vitest";
import { withoutPriceTalk } from "./products";

describe("withoutPriceTalk", () => {
  it("drops points about prices; the app shows the real range itself", () => {
    expect(
      withoutPriceTalk([
        "Prices are about $30 to $130.",
        "Prices start at about $120 and go up to $400.",
        "Most cost under $50.",
        "Some come with an extra battery.",
        "Many turn off by themselves when the water boils.",
      ]),
    ).toEqual(["Some come with an extra battery.", "Many turn off by themselves when the water boils."]);
  });

  it("keeps words that only look like prices", () => {
    expect(withoutPriceTalk(["Some are priceless heirlooms.", "Comes in 2 sizes."])).toEqual(["Some are priceless heirlooms.", "Comes in 2 sizes."]);
  });
});
