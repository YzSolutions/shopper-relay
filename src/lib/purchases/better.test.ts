import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../catalog/types";
import { FAMILY_ELDER_RULES } from "../policy";

const mocks = vi.hoisted(() => ({ generateJson: vi.fn(), search: vi.fn(), get: vi.fn(), decide: vi.fn(), log: vi.fn() }));

vi.mock("../ai/gemini", () => ({ generateJson: mocks.generateJson }));
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
  terms: null,
  category: { primary: "medical_device", categories: ["medical_device", "subscription"] },
} as unknown as Purchase;

const MEDICAL = ["Health", "Medical Devices", "Blood Pressure Monitors"];
function listing(sourceId: string, priceCents: number, { categoryPath = MEDICAL, description = "" } = {}): Product {
  return {
    source: "channel3",
    sourceId,
    title: `Monitor ${sourceId}`,
    brand: null,
    modelNumber: null,
    description,
    imageUrl: null,
    categoryPath,
    keyFeatures: [],
    attributes: {},
    offers: [{ merchant: "Store", priceCents, currency: "USD", available: true, url: "https://example.com" }],
  } as unknown as Product;
}

/** The AI's answers: what to search for, then which listing it picks. */
function aiPicks(listingId: string) {
  mocks.generateJson.mockResolvedValueOnce({ data: { query: "digital upper arm blood pressure monitor" } }).mockResolvedValueOnce({ data: { listing: listingId } });
}
const shownToAi = () => mocks.generateJson.mock.calls[1][0].parts[0].text as string;

beforeEach(() => vi.resetAllMocks());

describe("finding a better option", () => {
  it("takes the AI's closest match, not the cheapest", async () => {
    mocks.search.mockResolvedValue([listing("manual", 1699), listing("digital", 6949)]);
    aiPicks("L2");
    expect(await findBetter(household, held)).toMatchObject({ sourceId: "digital", priceCents: 6949 });
    expect(mocks.search.mock.calls[0][0]).toBe("digital upper arm blood pressure monitor");
  });

  it("only shows the AI what code already allows", async () => {
    mocks.search.mockResolvedValue([
      listing("toobig", 12000),
      listing("cuff", 3000, { categoryPath: ["Clothing"] }),
      listing("plan", 5000, { description: "Includes a monthly membership" }),
      listing("good", 8900),
    ]);
    aiPicks("L1");
    expect(await findBetter(household, held)).toMatchObject({ sourceId: "good" });
    expect(shownToAi()).toContain("Monitor good");
    for (const no of ["toobig", "cuff", "plan"]) expect(shownToAi()).not.toContain(`Monitor ${no}`);
  });

  it("offers nothing when none qualifies, the AI finds none, or it answers with a listing that isn't there", async () => {
    mocks.search.mockResolvedValue([listing("toobig", 12000)]);
    mocks.generateJson.mockResolvedValueOnce({ data: { query: "monitor" } });
    expect(await findBetter(household, held)).toBeNull();

    for (const answer of ["", "L9"]) {
      mocks.search.mockResolvedValue([listing("good", 8900)]);
      aiPicks(answer);
      expect(await findBetter(household, held)).toBeNull();
    }
  });

  it("offers nothing once the purchase is settled", async () => {
    expect(await findBetter(household, { ...held, state: "declined" })).toBeNull();
    expect(mocks.generateJson).not.toHaveBeenCalled();
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
