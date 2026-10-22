import type { RuleSet } from "./types";

/** The rules Mom sets up in the demo. Dollar amounts are in cents. */
export const DEMO_RULES: RuleSet = {
  categories: {
    general: {
      bands: [
        { minCents: 0, maxCents: 7500, approver: "self" },
        { minCents: 7500, maxCents: null, approver: "trusted_contact" },
      ],
      weeklySelfLimitCents: null,
    },
    clothing: {
      bands: [
        { minCents: 0, maxCents: 8000, approver: "self" },
        { minCents: 8000, maxCents: null, approver: "trusted_contact" },
      ],
      weeklySelfLimitCents: null,
    },
    medical_device: {
      bands: [
        { minCents: 0, maxCents: 10000, approver: "self" },
        { minCents: 10000, maxCents: null, approver: "trusted_contact" },
      ],
      weeklySelfLimitCents: 10000,
    },
    subscription: {
      bands: [{ minCents: 0, maxCents: null, approver: "trusted_contact" }],
      weeklySelfLimitCents: null,
    },
  },
};
