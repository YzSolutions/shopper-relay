import { describe, expect, it } from "vitest";
import { NO_FACTS, TOURS, tourFacts } from "./tour";

type P = Parameters<typeof tourFacts>[0][number];
const purchase = (flow: P["flow"], state: P["state"], outcome: P["decision"]["outcome"], terms: unknown = null) =>
  ({ flow, state, terms, decision: { outcome } }) as unknown as P;

describe("tourFacts", () => {
  it("starts with nothing done", () => {
    expect(tourFacts([], [])).toEqual(NO_FACTS);
  });

  it("tells buying alone apart from a reviewer deciding", () => {
    expect(tourFacts([purchase("hold", "completed", "auto")], [])).toMatchObject({ boughtAlone: true, heldDecided: false });
    expect(tourFacts([purchase("hold", "completed", "review")], [])).toMatchObject({ boughtAlone: false, heldDecided: true });
    expect(tourFacts([purchase("hold", "declined", "review")], []).heldDecided).toBe(true);
  });

  it("doesn't count a payment still waiting on the reviewer", () => {
    expect(tourFacts([purchase("hold", "awaiting_review", "review")], []).heldDecided).toBe(false);
    expect(tourFacts([purchase("request", "requested", "review")], []).requestDecided).toBe(false);
  });

  it("counts a purchase from a checked checkout, in any state", () => {
    expect(tourFacts([purchase("hold", "evaluated", "review", { totalDueTodayDollars: 149 })], []).checkedChosen).toBe(true);
  });

  it("reads the rest from the log", () => {
    expect(tourFacts([], ["requested", "otpa_granted", "otpa_used", "bill_sent", "rules_changed"])).toMatchObject({
      requested: true,
      otpaGranted: true,
      otpaUsed: true,
      billSent: true,
      rulesChanged: true,
    });
  });
});

describe("the tours", () => {
  it("has a tour for every relationship, each with steps that have somewhere to happen", () => {
    for (const steps of Object.values(TOURS)) {
      expect(steps.length).toBeGreaterThanOrEqual(3);
      for (const s of steps) expect(s.go || s.goHunting || /phone|PayPal/.test(s.how)).toBeTruthy();
    }
  });
});
