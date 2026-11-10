import { describe, expect, it } from "vitest";
import { isPlainSearch, priceLimit } from "./search";

describe("priceLimit", () => {
  it.each([
    ["noise cancelling headphones under 200 dollars", 19999],
    ["a kettle under $40", 3999],
    ["headphones below $9.99", 998],
    ["laptop no more than $899.99", 89999],
    ["a kettle up to $40", 4000],
    ["running shoes", null],
    ["4k tv 55 inch", null],
  ])("%s", (text, cents) => expect(priceLimit(text)).toBe(cents));
});

describe("isPlainSearch", () => {
  it("sends short searches as typed", () => {
    expect(isPlainSearch("wireless headphones")).toBe(true);
    expect(isPlainSearch("blood pressure monitor")).toBe(true);
  });
  it("boils down long or priced ones first", () => {
    expect(isPlainSearch("a camera for my trip that fits in my purse")).toBe(false);
    expect(isPlainSearch("kettle under $40")).toBe(false);
  });
});
