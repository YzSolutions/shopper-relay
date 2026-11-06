import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../catalog/types";
import { FAMILY_ELDER_RULES } from "../policy";

const mocks = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn(), decide: vi.fn(), log: vi.fn() }));

vi.mock("../ai/search", () => ({ searchTerms: async (q: string) => ({ query: q, maxPriceCents: null }) }));
vi.mock("../catalog/channel3", () => ({ createChannel3Source: () => ({ search: mocks.search, get: mocks.get }) }));
vi.mock("../store/events", () => ({ logEvent: mocks.log }));
vi.mock("../store/households", () => ({ getRulesState: async () => ({ owner: "shopper", rules: FAMILY_ELDER_RULES, pending: null }) }));
vi.mock("../store/purchases", () => ({ listPurchases: async () => [], summarize: (p: unknown) => p }));
vi.mock("./service", () => ({ FlowError: class FlowError extends Error {}, reviewerDecides: mocks.decide }));

import type { Household } from "../store/households";
import type { Purchase } from "../store/purchases";
import { declineWithBetter, findBetter } from "./better";

const household = { id: "h1", relationship: "family_elder", shopperName: "Mom", reviewerName: "Sarah", hideBrands: false } as Household;
const held = {
  id: "p1",
  flow: "hold",
  state: "awaiting_review",
  reviewedCents: 14900,
  reviewerName: "Sarah",
  item: { title: "Blood pressure monitor" },
  category: { primary: "medical_device", categories: ["medical_device", "subscription"] },
} as unknown as Purchase;

const MEDICAL = ["Health", "Medical Devices", "Blood Pressure Monitors"];
function listing(sourceId: string, priceCents: number, categoryPath = MEDICAL): Product {
  return {
    source: "channel3",
    sourceId,
    title: `Monitor ${sourceId}`,
    brand: null,
    modelNumber: null,
    description: "",
    imageUrl: null,
    categoryPath,
    keyFeatures: [],
    attributes: {},
    offers: [{ merchant: "Store", priceCents, currency: "USD", available: true, url: "https://example.com" }],
  } as unknown as Product;
}

beforeEach(() => vi.clearAllMocks());

describe("finding a better option", () => {
  it("skips what Mom's rules would send back to Sarah, and other kinds of product", async () => {
    mocks.search.mockResolvedValue([listing("toobig", 12000), listing("cuff", 3000, ["Clothing"]), listing("good", 8900)]);
    expect(await findBetter(household, held)).toMatchObject({ sourceId: "good", priceCents: 8900 });
  });

  it("offers nothing when nothing qualifies, or once the purchase is settled", async () => {
    mocks.search.mockResolvedValue([listing("toobig", 12000)]);
    expect(await findBetter(household, held)).toBeNull();
    expect(await findBetter(household, { ...held, state: "declined" })).toBeNull();
  });
});

describe("declining with a better option", () => {
  it("declines, then tells Mom", async () => {
    mocks.get.mockResolvedValue(listing("good", 8900));
    mocks.decide.mockResolvedValue({ ...held, state: "declined" });
    await declineWithBetter(household, held, "good");
    expect(mocks.decide).toHaveBeenCalledWith(household, held, "decline");
    expect(mocks.log.mock.calls[0][0]).toMatchObject({ type: "better_sent", detail: { sourceId: "good", priceCents: 8900 } });
  });

  it("refuses a listing that no longer qualifies, and declines nothing", async () => {
    mocks.get.mockResolvedValue(listing("rose", 12000));
    await expect(declineWithBetter(household, held, "rose")).rejects.toThrow(/no longer qualifies/);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
