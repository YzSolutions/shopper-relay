import { describe, expect, it } from "vitest";
import { tidyPoints, withoutPriceTalk } from "./products";

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

describe("tidyPoints", () => {
  const known = ["a", "b", "c"];

  it("keeps the ids of the results a point is about", () => {
    expect(tidyPoints([{ text: "Some have slip-resistant soles.", ids: ["a", "c"] }], known)).toEqual([{ text: "Some have slip-resistant soles.", ids: ["a", "c"] }]);
  });

  it("drops ids that aren't in the results, and repeats", () => {
    expect(tidyPoints([{ text: "Some fold flat.", ids: ["a", "a", "zzz"] }], known)).toEqual([{ text: "Some fold flat.", ids: ["a"] }]);
  });

  it("leaves a point plain when it fits every result or none", () => {
    expect(
      tidyPoints(
        [
          { text: "All are waterproof.", ids: ["c", "b", "a"] },
          { text: "Many styles to pick from.", ids: [] },
          { text: "Some are made on the moon.", ids: ["zzz"] },
        ],
        known,
      ).map((p) => p.ids),
    ).toEqual([[], [], []]);
  });

  it("drops points about prices", () => {
    expect(tidyPoints([{ text: "Most cost under $50.", ids: ["a"] }], known)).toEqual([]);
  });
});
