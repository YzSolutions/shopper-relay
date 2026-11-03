import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../catalog/types";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  get: vi.fn(),
  search: vi.fn(),
  buyWithOtpa: vi.fn(),
  loadCurrent: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../ai/gemini", () => ({ generateJson: mocks.generateJson }));
vi.mock("../catalog/channel3", () => ({ createChannel3Source: () => ({ get: mocks.get, search: mocks.search }) }));
vi.mock("../store/events", () => ({ logEvent: mocks.logEvent }));
vi.mock("./service", () => ({
  FlowError: class FlowError extends Error {},
  buyWithOtpa: mocks.buyWithOtpa,
  loadCurrent: mocks.loadCurrent,
}));

import type { Household } from "../store/households";
import { runAgent } from "./agent";

const household = { id: "h1", shopperName: "Priya", reviewerName: "Marcus", hideBrands: false } as Household;

function product(sourceId: string, offers: Array<[merchant: string, cents: number]>, title = "Trail Shoe"): Product {
  return {
    source: "channel3",
    sourceId,
    title,
    brand: "Acme",
    modelNumber: null,
    description: null,
    imageUrl: null,
    categoryPath: [],
    keyFeatures: [],
    attributes: {},
    offers: offers.map(([merchant, priceCents]) => ({ merchant, url: "", priceCents, compareAtCents: null, currency: "USD", available: true, condition: null })),
  };
}

const hunting = () => ({
  id: "p1",
  state: "hunting",
  reviewerName: null,
  otpa: {
    status: "active",
    maxCents: 10_000,
    details: "",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    product: { sourceId: "shoe", title: "Trail Shoe", brand: "Acme", modelNumber: null },
  },
});

const turn = (action: "search" | "buy" | "stop", extra: { query?: string; listing?: string } = {}) => ({
  data: { thought: `Going to ${action}.`, action, query: extra.query ?? "", listing: extra.listing ?? "" },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.loadCurrent.mockResolvedValue(hunting());
  mocks.search.mockResolvedValue([]);
  // L1 is over the price; L2 is within it.
  mocks.get.mockResolvedValue(
    product("shoe", [
      ["pricey.com", 12_000],
      ["fair.com", 8_900],
    ]),
  );
  mocks.buyWithOtpa.mockResolvedValue({ state: "completed", paypalCapturedCents: 8_900 });
});

describe("the AI shopper", () => {
  it("buys the listing it picks when code has allowed it, as the agent", async () => {
    mocks.generateJson.mockResolvedValueOnce(turn("buy", { listing: "L2" }));
    const run = await runAgent(household, "p1");
    expect(mocks.buyWithOtpa).toHaveBeenCalledExactlyOnceWith(household, "p1", "shoe", "fair.com", "agent");
    expect(run.purchase.state).toBe("completed");
    expect(run.steps.at(-1)?.text).toContain("released the other $11.00");
  });

  it("is refused a listing over the price, and it isn't bought", async () => {
    mocks.generateJson.mockResolvedValueOnce(turn("buy", { listing: "L1" })).mockResolvedValueOnce(turn("stop"));
    const run = await runAgent(household, "p1");
    expect(mocks.buyWithOtpa).not.toHaveBeenCalled();
    expect(run.steps.some((s) => s.kind === "refused" && /over the approved price/.test(s.text))).toBe(true);
  });

  it("is refused a different product found by searching", async () => {
    mocks.search.mockResolvedValue([product("other", [["cheap.com", 1_000]], "Look-alike Shoe")]);
    mocks.generateJson
      .mockResolvedValueOnce(turn("search", { query: "trail shoe" }))
      .mockResolvedValueOnce(turn("buy", { listing: "L3" }))
      .mockResolvedValueOnce(turn("stop"));
    const run = await runAgent(household, "p1");
    expect(mocks.buyWithOtpa).not.toHaveBeenCalled();
    expect(run.steps.some((s) => s.kind === "refused" && /different product/.test(s.text))).toBe(true);
  });

  it("is refused a listing that doesn't exist", async () => {
    mocks.generateJson.mockResolvedValueOnce(turn("buy", { listing: "L99" })).mockResolvedValueOnce(turn("stop"));
    await runAgent(household, "p1");
    expect(mocks.buyWithOtpa).not.toHaveBeenCalled();
  });

  it("stops after its last turn, even if it still wants to search", async () => {
    mocks.generateJson.mockResolvedValue(turn("search", { query: "trail shoe" }));
    const run = await runAgent(household, "p1");
    expect(mocks.generateJson).toHaveBeenCalledTimes(4);
    expect(mocks.search).toHaveBeenCalledTimes(3);
    expect(mocks.buyWithOtpa).not.toHaveBeenCalled();
    expect(run.steps.at(-1)?.kind).toBe("stopped");
  });

  it("buys nothing when the AI can't answer", async () => {
    mocks.generateJson.mockRejectedValue(new Error("overloaded"));
    const run = await runAgent(household, "p1");
    expect(mocks.generateJson).toHaveBeenCalledTimes(2);
    expect(mocks.buyWithOtpa).not.toHaveBeenCalled();
    expect(run.steps.at(-1)?.text).toContain("Nothing was bought");
  });

  it("won't start unless the authorization is active", async () => {
    mocks.loadCurrent.mockResolvedValue({ ...hunting(), state: "completed" });
    await expect(runAgent(household, "p1")).rejects.toThrow("completed");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("keeps real store and brand names off the screen in demo mode, even in the AI's words", async () => {
    mocks.generateJson.mockResolvedValueOnce({ data: { thought: "Fair has the Acme shoe at fair.com for less.", action: "buy", query: "", listing: "L2" } });
    const run = await runAgent({ ...household, hideBrands: true }, "p1");
    const text = run.steps.map((s) => s.text).join(" ");
    expect(text).not.toMatch(/acme|fair\.com|\bfair\b/i);
  });
});
