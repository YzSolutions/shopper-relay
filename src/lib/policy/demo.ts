import type { RuleSet } from "./types";

/** The rules Mom sets up in the demo. Dollar amounts are in cents. */
export const DEMO_RULES: RuleSet = {
  categories: {
    general: {
      bands: [
        { minCents: 0, maxCents: 7500, approver: "shopper" },
        { minCents: 7500, maxCents: null, approver: "reviewer" },
      ],
      weeklyShopperLimitCents: null,
    },
    clothing: {
      bands: [
        { minCents: 0, maxCents: 8000, approver: "shopper" },
        { minCents: 8000, maxCents: null, approver: "reviewer" },
      ],
      weeklyShopperLimitCents: null,
    },
    medical_device: {
      bands: [
        { minCents: 0, maxCents: 10000, approver: "shopper" },
        { minCents: 10000, maxCents: null, approver: "reviewer" },
      ],
      weeklyShopperLimitCents: 10000,
    },
    subscription: {
      bands: [{ minCents: 0, maxCents: null, approver: "reviewer" }],
      weeklyShopperLimitCents: null,
    },
  },
};
