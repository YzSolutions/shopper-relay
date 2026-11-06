import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SHOPPER_RULES } from "../policy";

const mocks = vi.hoisted(() => ({ generateJson: vi.fn(), search: vi.fn(), choose: vi.fn(), send: vi.fn() }));

vi.mock("../ai/gemini", () => ({ generateJson: mocks.generateJson }));
vi.mock("../ai/search", () => ({ searchTerms: async (q: string) => ({ query: q, maxPriceCents: null }) }));
vi.mock("../catalog/channel3", () => ({ createChannel3Source: () => ({ search: mocks.search }) }));
vi.mock("../store/events", () => ({ logEvent: vi.fn() }));
vi.mock("../store/households", () => ({ getRulesState: async () => ({ owner: "reviewer", rules: AI_SHOPPER_RULES, pending: null }) }));
vi.mock("../store/purchases", () => ({ listPurchases: async () => [], summarize: (p: unknown) => p }));
vi.mock("../store/standing", () => ({ getStanding: async () => null }));
vi.mock("./agent", () => ({ hideNames: (t: string) => t }));
vi.mock("./service", () => ({ FlowError: class FlowError extends Error {}, buyWithStanding: vi.fn(), chooseCatalogItem: mocks.choose, sendRequest: mocks.send }));

import type { Household } from "../store/households";
import { runGoal } from "./goalAgent";

const household = { id: "h1", relationship: "ai_shopper", shopperName: "AI Shopper", reviewerName: "Sarah", hideBrands: false } as Household;
const clock = {
  source: "channel3",
  sourceId: "c1",
  title: "Desk Clock",
  brand: null,
  categoryPath: ["Home & Garden", "Decor"],
  offers: [{ merchant: "Store", priceCents: 2199, currency: "USD", available: true, url: "https://example.com" }],
};
const turn = (action: string, listing = "") => ({ data: { thought: "Thinking.", action, query: "", listing } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue([clock]);
  mocks.choose.mockResolvedValue({ id: "p1" });
  mocks.send.mockResolvedValue({ id: "p1", state: "requested", decision: { outcome: "review", reasons: [] } });
});

describe("the AI Shopper stopping too early", () => {
  it("gets a second opinion, with no saved answer, when there was something to choose", async () => {
    mocks.generateJson.mockResolvedValueOnce(turn("stop")).mockResolvedValueOnce(turn("choose", "L1"));
    const { purchase } = await runGoal(household, "a desk clock");
    expect(mocks.generateJson.mock.calls[1][0]).toMatchObject({ speed: "careful", fresh: true });
    expect(purchase?.state).toBe("requested");
  });

  it("takes the stop when there's nothing to choose", async () => {
    mocks.search.mockResolvedValue([]);
    mocks.generateJson.mockResolvedValueOnce(turn("stop"));
    const { purchase } = await runGoal(household, "a desk clock");
    expect(mocks.generateJson).toHaveBeenCalledTimes(1);
    expect(purchase).toBeNull();
  });
});
